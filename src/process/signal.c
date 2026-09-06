#define _GNU_SOURCE
#include <dolly/process.h>
#include <dolly/runtime.h>
#include <errno.h>
#include <signal.h>
#include <stdint.h>

__attribute__((import_module("dolly_process_0"), import_name("call")))
int64_t raw_process_call(uint32_t operation, const void *request,
                        uint64_t request_size, void *response, uint64_t capacity);

static struct sigaction actions[_NSIG];
static sigset_t blocked, pending;

static int valid_signal(int signal_number) {
  return signal_number > 0 && signal_number < _NSIG;
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
  if (previous) *previous = actions[signal_number];
  if (action) actions[signal_number] = *action;
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
    const struct sigaction action = actions[number];
    if (action.sa_handler == SIG_IGN) continue;
    if (action.sa_handler == SIG_DFL) {
      switch (number) {
        case SIGCHLD: case SIGURG: case SIGWINCH: continue;
        case SIGHUP: case SIGINT: case SIGQUIT: case SIGABRT:
        case SIGKILL: case SIGPIPE: case SIGTERM: dolly_exit_signal(number);
        default: errno = ENOTSUP; return -1;
      }
    }
    const sigset_t previous = blocked;
    for (int bit = 1; bit < _NSIG; ++bit) {
      if (sigismember(&action.sa_mask, bit) == 1) sigaddset(&blocked, bit);
    }
    if (!(action.sa_flags & SA_NODEFER)) sigaddset(&blocked, number);
    sigdelset(&blocked, SIGKILL);
    sigdelset(&blocked, SIGSTOP);
    if (action.sa_flags & SA_RESETHAND) {
      actions[number].sa_handler = SIG_DFL;
      actions[number].sa_flags &= ~SA_SIGINFO;
    }
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

int pthread_sigmask(int how, const sigset_t *restrict set, sigset_t *restrict previous) {
  if (set && how != SIG_BLOCK && how != SIG_UNBLOCK && how != SIG_SETMASK) return EINVAL;
  if (previous) *previous = blocked;
  if (!set) return 0;
  for (int number = 1; number < _NSIG; ++number) {
    const int member = sigismember(set, number) == 1;
    if (how == SIG_SETMASK || member) {
      if (member && how != SIG_UNBLOCK && number != SIGKILL && number != SIGSTOP)
        sigaddset(&blocked, number);
      else sigdelset(&blocked, number);
    }
  }
  return deliver_pending() < 0 ? errno : 0;
}

int sigprocmask(int how, const sigset_t *restrict set, sigset_t *restrict previous) {
  const int error = pthread_sigmask(how, set, previous);
  if (!error) return 0;
  errno = error;
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
        operation == DOLLY_PROCESS_CLOCK_SLEEP)) return -EINTR;
    if (restart == 1 && (operation == DOLLY_PROCESS_FD_POLL ||
        operation == DOLLY_PROCESS_CLOCK_SLEEP)) return -EINTR;
  }
}
