#define _GNU_SOURCE
#include <dolly/process.h>
#include <dolly/runtime.h>
#include <errno.h>
#include <limits.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <sys/select.h>
#include "lock.h"

__attribute__((import_module("dolly_process_0"), import_name("call")))
int64_t raw_process_call(uint32_t operation, const void *request,
                        uint64_t request_size, void *response, uint64_t capacity);

_Static_assert(SIGHUP == DOLLY_PROCESS_SIGHUP && SIGINT == DOLLY_PROCESS_SIGINT &&
               SIGQUIT == DOLLY_PROCESS_SIGQUIT && SIGABRT == DOLLY_PROCESS_SIGABRT &&
               SIGKILL == DOLLY_PROCESS_SIGKILL && SIGPIPE == DOLLY_PROCESS_SIGPIPE &&
               SIGALRM == DOLLY_PROCESS_SIGALRM &&
               SIGTERM == DOLLY_PROCESS_SIGTERM && SIGCHLD == DOLLY_PROCESS_SIGCHLD &&
               SIGWINCH == DOLLY_PROCESS_SIGWINCH, "process signal numbers");

static struct sigaction actions[_NSIG];
static _Thread_local sigset_t blocked, pending;
static dolly_lock action_lock;

static int valid_signal(int signal_number) {
  return signal_number > 0 && signal_number < _NSIG;
}

/* The kernel forces SIGALRM's default action, even on a process that makes no
 * system call, unless userspace handles or ignores the signal. */
static int64_t report_alarm_handled(int32_t handled) {
  return dolly_process_call(DOLLY_PROCESS_ALARM_HANDLED, &handled, sizeof(handled), NULL, 0);
}

int __sigaction(int signal_number, const struct sigaction *restrict action,
                struct sigaction *restrict previous) {
  if (!valid_signal(signal_number) || (action && (signal_number == SIGKILL || signal_number == SIGSTOP))) {
    errno = EINVAL;
    return -1;
  }
  /* SA_ONSTACK uses the current stack when no alternate stack is configured. */
  if (action && (action->sa_flags & ~(SA_RESTART | SA_RESETHAND | SA_NODEFER | SA_SIGINFO | SA_ONSTACK))) {
    errno = ENOTSUP;
    return -1;
  }
  if (action && signal_number == SIGALRM) {
    const int64_t result = report_alarm_handled(action->sa_handler != SIG_DFL);
    if (result < 0) { errno = (int)-result; return -1; }
  }
  dolly_lock_acquire(&action_lock);
  if (previous) *previous = actions[signal_number];
  if (action) actions[signal_number] = *action;
  dolly_lock_release(&action_lock);
  return 0;
}

int sigaction(int signal_number, const struct sigaction *restrict action,
              struct sigaction *restrict previous) {
  return __sigaction(signal_number, action, previous);
}

static int deliver_pending(void) {
  const int saved_errno = errno;
  int restart = 2; /* No handler, restartable handler, interrupting handler. */
  for (int number = 1; number < _NSIG; ++number) {
    if (sigismember(&pending, number) != 1 || sigismember(&blocked, number) == 1) continue;
    sigdelset(&pending, number);
    dolly_lock_acquire(&action_lock);
    const struct sigaction action = actions[number];
    if (action.sa_flags & SA_RESETHAND) {
      actions[number].sa_handler = SIG_DFL;
      actions[number].sa_flags &= ~SA_SIGINFO;
    }
    dolly_lock_release(&action_lock);
    if (number == SIGALRM && (action.sa_flags & SA_RESETHAND)) report_alarm_handled(0);
    if (action.sa_handler == SIG_IGN) continue;
    if (action.sa_handler == SIG_DFL) {
      if (number == SIGCHLD || number == SIGURG || number == SIGWINCH) continue;
      if (number < 32 && ((DOLLY_PROCESS_SIGNAL_MASK >> number) & 1u)) dolly_exit_signal(number);
      errno = ENOTSUP;
      return -1;
    }
    const sigset_t previous = blocked;
    for (int bit = 1; bit < _NSIG; ++bit) {
      if (sigismember(&action.sa_mask, bit) == 1) sigaddset(&blocked, bit);
    }
    if (!(action.sa_flags & SA_NODEFER)) sigaddset(&blocked, number);
    sigdelset(&blocked, SIGKILL);
    sigdelset(&blocked, SIGSTOP);
    if (!(action.sa_flags & SA_RESTART)) restart = 0;
    else if (restart == 2) restart = 1;
    if (action.sa_flags & SA_SIGINFO) {
      siginfo_t information = {.si_signo = number, .si_code = SI_USER};
      action.sa_sigaction(number, &information, NULL);
    } else action.sa_handler(number);
    blocked = previous;
    number = 0; /* A handler may re-raise a signal after restoring its disposition. */
  }
  errno = saved_errno;
  return restart;
}

int raise(int signal_number) {
  if (!valid_signal(signal_number)) { errno = EINVAL; return -1; }
  if (signal_number == SIGKILL) dolly_exit_signal(signal_number);
  if (signal_number == SIGSTOP) { errno = ENOTSUP; return -1; }
  sigaddset(&pending, signal_number);
  return deliver_pending() < 0 ? -1 : 0;
}

/* Returns deliver_pending's result: 2 when no handler ran. */
static int set_mask(int how, const sigset_t *set) {
  for (int number = 1; number < _NSIG; ++number) {
    const int member = sigismember(set, number) == 1;
    if (how == SIG_SETMASK || member) {
      if (member && how != SIG_UNBLOCK && number != SIGKILL && number != SIGSTOP)
        sigaddset(&blocked, number);
      else sigdelset(&blocked, number);
    }
  }
  return deliver_pending();
}

int pthread_sigmask(int how, const sigset_t *restrict set, sigset_t *restrict previous) {
  if (set && how != SIG_BLOCK && how != SIG_UNBLOCK && how != SIG_SETMASK) return EINVAL;
  if (previous) *previous = blocked;
  if (!set) return 0;
  return set_mask(how, set) < 0 ? errno : 0;
}

/* Atomic over Dolly's signals: a pending signal the mask unblocks interrupts
 * before the wait, and the kernel interrupts a poll it delivers into. */
int pselect(int count, fd_set *restrict readers, fd_set *restrict writers,
            fd_set *restrict errors, const struct timespec *restrict timeout,
            const sigset_t *restrict mask) {
  if (count < 0 || count > FD_SETSIZE || (timeout && (timeout->tv_sec < 0 ||
      timeout->tv_nsec < 0 || timeout->tv_nsec >= 1000000000))) {
    errno = EINVAL;
    return -1;
  }
  struct pollfd descriptors[FD_SETSIZE];
  nfds_t used = 0;
  for (int descriptor = 0; descriptor < count; ++descriptor) {
    const short events = (readers && FD_ISSET(descriptor, readers) ? POLLIN : 0) |
        (writers && FD_ISSET(descriptor, writers) ? POLLOUT : 0) |
        (errors && FD_ISSET(descriptor, errors) ? POLLPRI : 0);
    if (events) descriptors[used++] = (struct pollfd){descriptor, events, 0};
  }
  int milliseconds = -1;
  if (timeout) {
    const long long rounded = (long long)timeout->tv_sec * 1000 + (timeout->tv_nsec + 999999) / 1000000;
    milliseconds = rounded > INT_MAX ? INT_MAX : (int)rounded;
  }
  const sigset_t previous = blocked;
  const int delivered = mask ? set_mask(SIG_SETMASK, mask) : 2;
  if (delivered >= 0 && delivered < 2) errno = EINTR;
  int ready = delivered == 2 ? poll(descriptors, used, milliseconds) : -1;
  if (mask) {
    const int error = errno;
    set_mask(SIG_SETMASK, &previous);
    errno = error;
  }
  for (nfds_t index = 0; ready > 0 && index < used; ++index) {
    if (descriptors[index].revents & POLLNVAL) { errno = EBADF; return -1; }
  }
  if (ready < 0) return -1;
  if (readers) FD_ZERO(readers);
  if (writers) FD_ZERO(writers);
  if (errors) FD_ZERO(errors);
  ready = 0;
  for (nfds_t index = 0; index < used; ++index) {
    const struct pollfd *polled = &descriptors[index];
    if ((polled->events & POLLIN) && (polled->revents & (POLLIN | POLLHUP | POLLERR))) {
      FD_SET(polled->fd, readers);
      ++ready;
    }
    if ((polled->events & POLLOUT) && (polled->revents & (POLLOUT | POLLERR))) {
      FD_SET(polled->fd, writers);
      ++ready;
    }
    if ((polled->events & POLLPRI) && (polled->revents & POLLPRI)) {
      FD_SET(polled->fd, errors);
      ++ready;
    }
  }
  return ready;
}

int sigprocmask(int how, const sigset_t *restrict set, sigset_t *restrict previous) {
  const int error = pthread_sigmask(how, set, previous);
  if (!error) return 0;
  errno = error;
  return -1;
}

/* Only a delivered handler interrupts an empty poll. */
int pause(void) {
  return poll(NULL, 0, -1);
}

int sigpending(sigset_t *set) {
  if (!set) { errno = EFAULT; return -1; }
  *set = pending;
  return 0;
}

/* Do not link Emscripten's sigwait implementation and its second signal mask. */
int sigtimedwait(const sigset_t *restrict set, siginfo_t *restrict information,
                 const struct timespec *restrict timeout) {
  (void)set; (void)information; (void)timeout;
  errno = ENOTSUP;
  return -1;
}

int sigwaitinfo(const sigset_t *restrict set, siginfo_t *restrict information) {
  return sigtimedwait(set, information, NULL);
}

int sigwait(const sigset_t *restrict set, int *restrict number) {
  (void)set; (void)number;
  return ENOTSUP;
}

int64_t dolly_process_call(uint32_t operation, const void *request,
                           uint64_t request_size, void *response, uint64_t capacity) {
  for (;;) {
    const int64_t result = raw_process_call(operation, request, request_size, response, capacity);
    if (result != -EINTR) return result;
    int32_t number = 0, remaining = 0;
    if (raw_process_call(DOLLY_PROCESS_INTERRUPT_POLL, NULL, 0, &number, sizeof(number)) != sizeof(number) || !number)
      return result;
    sigaddset(&pending, number);
    const int restart = deliver_pending();
    if (raw_process_call(DOLLY_PROCESS_SIGNAL_ACKNOWLEDGE, &number, sizeof(number),
                         &remaining, sizeof(remaining)) != sizeof(remaining)) return -EIO;
    if (restart < 0) return -ENOTSUP;
    if (!restart && (operation == DOLLY_PROCESS_FD_READ || operation == DOLLY_PROCESS_FD_WRITE ||
        operation == DOLLY_PROCESS_WAIT || operation == DOLLY_PROCESS_FD_POLL ||
        operation == DOLLY_PROCESS_CLOCK_SLEEP || operation == DOLLY_PROCESS_FD_LOCK)) return -EINTR;
    if (restart == 1 && (operation == DOLLY_PROCESS_FD_POLL ||
        operation == DOLLY_PROCESS_CLOCK_SLEEP)) return -EINTR;
  }
}
