#define _GNU_SOURCE
#include <dolly/process.h>
#include <dolly/runtime.h>
#include <errno.h>
#include <limits.h>
#include <poll.h>
#include <setjmp.h>
#include <signal.h>
#include <stdint.h>
#include <string.h>
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
/* What the kernel was last told of the actions. */
static dolly_process_signal_dispositions reported;
/* The signal the kernel has handed over. It delivers no other, and the
 * supervisor ends the process 500 ms after a terminating one, until it hears
 * that this one's handler is over. */
static _Thread_local int32_t taken;

/* Every hand-over and its end pass here: dolly_process_call's own and those
 * dolly_interrupt_poll makes through it. */
static int64_t kernel_call(uint32_t operation, const void *request,
                           uint64_t request_size, void *response, uint64_t capacity) {
  const int64_t result = raw_process_call(operation, request, request_size, response, capacity);
  if (operation == DOLLY_PROCESS_INTERRUPT_POLL && result == sizeof(taken)) {
    int32_t number;
    memcpy(&number, response, sizeof(number));
    if (number) taken = number;
  }
  if (operation == DOLLY_PROCESS_SIGNAL_ACKNOWLEDGE) taken = 0;
  return result;
}

/* A handler is over when it returns and when a jump leaves it; the jump has
 * to say so, since it never comes back to the call that delivered. */
static int64_t finished(void) {
  int32_t number = taken, remaining;
  if (!number) return sizeof(remaining);
  return kernel_call(DOLLY_PROCESS_SIGNAL_ACKNOWLEDGE, &number, sizeof(number),
                     &remaining, sizeof(remaining));
}

static int valid_signal(int signal_number) {
  return signal_number > 0 && signal_number < _NSIG;
}

/* The kernel acts on the dispositions of the signals it numbers: it discards
 * an ignored signal, reaps for an ignored SIGCHLD and ends a process by a
 * signal it does not handle. Told after each change, under action_lock: the
 * call is never interrupted, so no handler runs inside it. */
static int64_t report_dispositions(void) {
  dolly_process_signal_dispositions dispositions = {0};
  for (int number = 1; number < 32; ++number) {
    if (actions[number].sa_handler == SIG_IGN) dispositions.ignored_signals |= 1u << number;
    else if (actions[number].sa_handler != SIG_DFL) dispositions.handled_signals |= 1u << number;
  }
  if (!memcmp(&dispositions, &reported, sizeof(reported))) return 0;
  const int64_t result = raw_process_call(DOLLY_PROCESS_SIGNAL_DISPOSITIONS,
                                          &dispositions, sizeof(dispositions), NULL, 0);
  if (result == 0) reported = dispositions;
  return result;
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
  dolly_lock_acquire(&action_lock);
  const struct sigaction kept = actions[signal_number];
  if (action) actions[signal_number] = *action;
  const int64_t result = report_dispositions();
  if (result < 0) actions[signal_number] = kept;
  else if (previous) *previous = kept;
  dolly_lock_release(&action_lock);
  if (result < 0) { errno = (int)-result; return -1; }
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
      report_dispositions();
    }
    dolly_lock_release(&action_lock);
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

/* pselect's wait without descriptors: it returns once a handler has run. */
int sigsuspend(const sigset_t *mask) {
  pselect(0, NULL, NULL, NULL, NULL, mask);
  return -1;
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

/* As POSIX says, SIGABRT's handler runs unless the signal is blocked, and if
 * it returns, or the signal is blocked or ignored, the process ends by
 * SIGABRT. Emscripten's abort traps instead: the process failed with 126.
 * Weak, because this archive is linked whole: a program's own abort
 * (SpiderMonkey's mozalloc has one) takes its place, as with a static libc. */
__attribute__((__weak__)) _Noreturn void abort(void) {
  raise(SIGABRT);
  dolly_exit_signal(SIGABRT);
}

/* The jump itself, whatever <setjmp.h> makes of the name longjmp. */
_Noreturn void jump(jmp_buf, int) __asm__("longjmp");

/* longjmp and _longjmp, as <setjmp.h> declares them. The mask stays as the
 * handler had it, as on Linux. A jump inside a handler counts as leaving it. */
_Noreturn void dolly_longjmp(jmp_buf environment, int value) {
  finished();
  jump(environment, value);
}

/* sigsetjmp is a macro, because setjmp must be called by the function that
 * returns twice: it first notes here whether siglongjmp restores the mask,
 * and which, in the words musl's jmp_buf keeps for that. */
_Static_assert(sizeof(((struct __jmp_buf_tag *)0)->__ss) >= sizeof(sigset_t), "jmp_buf holds a signal mask");
int dolly_sigsetjmp(sigjmp_buf environment, int save) {
  environment->__fl = save != 0;
  if (save) memcpy(environment->__ss, &blocked, sizeof(blocked));
  return 0;
}

#undef siglongjmp
_Noreturn void siglongjmp(sigjmp_buf environment, int value) {
  finished();
  if (environment->__fl) {
    sigset_t saved;
    memcpy(&saved, environment->__ss, sizeof(saved));
    set_mask(SIG_SETMASK, &saved);
  }
  jump(environment, value);
}

/* After a call returned EINTR: delivers the signal the kernel hands over.
 * Zero when the call is to be made again, otherwise what it returns. */
static int64_t interrupted(uint32_t operation) {
  int32_t number = 0;
  if (kernel_call(DOLLY_PROCESS_INTERRUPT_POLL, NULL, 0, &number, sizeof(number)) != sizeof(number) || !number)
    return -EINTR;
  sigaddset(&pending, number);
  const int restart = deliver_pending();
  if (finished() != sizeof(number)) return -EIO;
  if (restart < 0) return -ENOTSUP;
  if (!restart && (operation == DOLLY_PROCESS_FD_READ || operation == DOLLY_PROCESS_FD_WRITE ||
      operation == DOLLY_PROCESS_WAIT || operation == DOLLY_PROCESS_FD_POLL ||
      operation == DOLLY_PROCESS_CLOCK_SLEEP || operation == DOLLY_PROCESS_FD_LOCK)) return -EINTR;
  if (restart == 1 && (operation == DOLLY_PROCESS_FD_POLL ||
      operation == DOLLY_PROCESS_CLOCK_SLEEP)) return -EINTR;
  return 0;
}

int64_t dolly_process_call(uint32_t operation, const void *request,
                           uint64_t request_size, void *response, uint64_t capacity) {
  for (;;) {
    const int64_t result = kernel_call(operation, request, request_size, response, capacity);
    if (result != -EINTR) return result;
    const int64_t ended = interrupted(operation);
    if (ended != 0) return ended;
  }
}

/* What exec passes on: the mask, the ignored signals and those taken from the
 * kernel but not delivered, of the signals the kernel numbers. */
static void exec_signals(dolly_process_exec_state *state) {
  *state = (dolly_process_exec_state){0};
  dolly_lock_acquire(&action_lock);
  for (int number = 1; number < 32; ++number) {
    const uint32_t bit = 1u << number;
    if (sigismember(&blocked, number) == 1) state->blocked_signals |= bit;
    if (sigismember(&pending, number) == 1) state->pending_signals |= bit;
    if (actions[number].sa_handler == SIG_IGN) state->ignored_signals |= bit;
  }
  dolly_lock_release(&action_lock);
}

/* EXEC, carrying the signal state the program has when the kernel takes the
 * call: a handler that a pending signal runs first may change it. Returns only
 * on failure. */
int64_t __dolly_process_exec(dolly_process_exec_request *request, uint64_t size) {
  for (;;) {
    exec_signals(&request->signals);
    const int64_t result = kernel_call(DOLLY_PROCESS_EXEC, request, size, NULL, 0);
    if (result != -EINTR) return result < 0 ? result : -EIO;
    /* EINTR with no signal to take, as inside a handler: call again. */
    const int64_t ended = interrupted(DOLLY_PROCESS_EXEC);
    if (ended != 0 && ended != -EINTR) return ended;
  }
}

/* The signal state the program that exec replaced, or the spawning one, left
 * this one, read before any call a pending signal could interrupt: crt1.c's
 * first. The kernel knows these ignored signals already. */
void __dolly_signal_start(void) {
  dolly_process_exec_state state;
  if (raw_process_call(DOLLY_PROCESS_EXEC, NULL, 0, &state, sizeof(state)) != sizeof(state)) return;
  reported.ignored_signals = state.ignored_signals;
  for (int number = 1; number < 32; ++number) {
    const uint32_t bit = 1u << number;
    if (number == SIGKILL || number == SIGSTOP) continue;
    if (state.blocked_signals & bit) sigaddset(&blocked, number);
    if (state.pending_signals & bit) sigaddset(&pending, number);
    if (state.ignored_signals & bit) actions[number].sa_handler = SIG_IGN;
  }
}
