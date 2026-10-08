// A signal handler may leave by a jump instead of returning, as a pager or a
// shell leaves a blocking read. The kernel must hear that it is over: the next
// signal arrives, and the grace a terminating signal gives an unfinished
// handler does not end the process. siglongjmp restores the mask that
// sigsetjmp(env, 1) saved and leaves it after sigsetjmp(env, 0).
#define _GNU_SOURCE
#include <dolly/runtime.h>
#include <errno.h>
#include <setjmp.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define CHECK(test) do { if (!(test)) { fprintf(stderr, "JUMP FAIL %d: %s errno=%d\n", \
    __LINE__, #test, errno); exit(1); } } while (0)

static sigjmp_buf masked;
static jmp_buf plain;
static volatile sig_atomic_t taken, jumps;

static void leave_masked(int number) {
  taken = number;
  ++jumps;
  siglongjmp(masked, 1);
}

static void leave_plain(int number) {
  taken = number;
  ++jumps;
  longjmp(plain, 1);
}

static int blocked(int number) {
  sigset_t mask;
  CHECK(sigprocmask(SIG_BLOCK, NULL, &mask) == 0);
  return sigismember(&mask, number);
}

static void unblock(int number) {
  sigset_t mask;
  sigemptyset(&mask);
  sigaddset(&mask, number);
  CHECK(sigprocmask(SIG_UNBLOCK, &mask, NULL) == 0);
}

/* Sends this process NUMBER and waits where its handler jumps away from. */
static void await(int number) {
  taken = 0;
  CHECK(kill(getpid(), number) == 0);
  for (int tick = 0; tick < 200; ++tick) usleep(10000);
  CHECK(!"the signal was not delivered");
}

/* Resizes and Ctrl+C at the terminal: a line for each jump, and q ends with
 * their number as the status. */
static int at_terminal(int with_mask) {
  puts("JUMP-READY");
  for (;;) {
    char key = 0;
    if (with_mask ? sigsetjmp(masked, 1) : setjmp(plain)) {
      if (!with_mask) unblock(taken);
      printf("JUMPED %d\n", (int)jumps);
    }
    fflush(stdout);
    if (read(STDIN_FILENO, &key, 1) == 1 && key == 'q') return jumps;
  }
}

int main(int argc, char **argv) {
  const int numbers[] = {SIGWINCH, SIGINT, SIGTERM};
  volatile int round, index;
  if (argc == 2) {
    const int with_mask = !strcmp(argv[1], "siglongjmp");
    CHECK(with_mask || !strcmp(argv[1], "longjmp"));
    if (with_mask) {
      const struct sigaction action = {.sa_handler = leave_masked};
      CHECK(sigaction(SIGWINCH, &action, NULL) == 0 && sigaction(SIGINT, &action, NULL) == 0);
    } else {
      CHECK(signal(SIGWINCH, leave_plain) != SIG_ERR && signal(SIGINT, leave_plain) != SIG_ERR);
    }
    return at_terminal(with_mask);
  }

  /* The saved mask is SIGHUP alone; the handler runs with its signal and
   * SIGQUIT blocked as well. */
  sigset_t hangup;
  sigemptyset(&hangup);
  sigaddset(&hangup, SIGHUP);
  CHECK(sigprocmask(SIG_SETMASK, &hangup, NULL) == 0);
  struct sigaction action = {.sa_handler = leave_masked};
  sigemptyset(&action.sa_mask);
  sigaddset(&action.sa_mask, SIGQUIT);
  for (index = 0; index < 3; ++index) CHECK(sigaction(numbers[index], &action, NULL) == 0);
  for (round = 0; round < 3; ++round) {
    for (index = 0; index < 3; ++index) {
      if (sigsetjmp(masked, 1) == 0) await(numbers[index]);
      CHECK(taken == numbers[index]);
      CHECK(blocked(SIGHUP) == 1 && blocked(numbers[index]) == 0 && blocked(SIGQUIT) == 0);
    }
    /* Past the 500 ms a terminating signal allows a handler that is not over. */
    if (round == 0) usleep(700000);
  }
  CHECK(jumps == 9);

  if (sigsetjmp(masked, 0) == 0) await(SIGTERM);
  CHECK(taken == SIGTERM && blocked(SIGTERM) == 1 && blocked(SIGQUIT) == 1 && blocked(SIGHUP) == 1);
  CHECK(sigprocmask(SIG_SETMASK, &hangup, NULL) == 0);

  /* A signal taken by a poll is over when its handler jumps, too. */
  taken = 0;
  if (sigsetjmp(masked, 1) == 0) {
    CHECK(kill(getpid(), SIGTERM) == 0);
    for (;;) dolly_interrupt_poll();
  }
  CHECK(taken == SIGTERM);
  if (sigsetjmp(masked, 1) == 0) await(SIGWINCH);
  CHECK(taken == SIGWINCH && jumps == 12);

  /* longjmp from a handler that signal() installed. It leaves the handler's
   * mask, so the program unblocks its signal, as such programs do. */
  CHECK(signal(SIGWINCH, leave_plain) != SIG_ERR && signal(SIGINT, leave_plain) != SIG_ERR);
  for (round = 0; round < 3; ++round) {
    for (index = 0; index < 2; ++index) {
      if (setjmp(plain) == 0) await(numbers[index]);
      CHECK(taken == numbers[index]);
      unblock(numbers[index]);
    }
  }
  CHECK(jumps == 18);
  puts("PROCESS-JUMP-OK");
  return 0;
}
