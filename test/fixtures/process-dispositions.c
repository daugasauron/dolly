// What the kernel does with a program's signal dispositions: posix_spawn
// gives the child the mask and ignored signals, as exec does, and with
// SIGCHLD ignored the children are reaped as they end.
#define _GNU_SOURCE
#include <errno.h>
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

extern char **environ;
static int failures;
#define CHECK(condition) do { if (!(condition)) { \
  fprintf(stderr, "DISPOSITIONS FAIL line %d: %s (errno %d)\n", __LINE__, #condition, errno); \
  ++failures; } } while (0)

static void note(int number) { (void)number; }

static int handler_is(int number, void (*handler)(int)) {
  struct sigaction action;
  return sigaction(number, NULL, &action) == 0 && action.sa_handler == handler;
}

static int blocked(int number) {
  sigset_t mask;
  return sigprocmask(SIG_BLOCK, NULL, &mask) == 0 && sigismember(&mask, number) == 1;
}

// Spawns this program in `mode` and returns its status, or the negated error.
static int run(char *self, const posix_spawnattr_t *attributes, char *mode) {
  char *arguments[] = {self, mode, NULL};
  pid_t pid;
  int status;
  const int error = posix_spawn(&pid, self, NULL, attributes, arguments, environ);
  if (error != 0) return -error;
  return waitpid(pid, &status, 0) == pid ? status : -ECHILD;
}

int main(int argc, char **argv) {
  const char *mode = argc > 1 ? argv[1] : "";
  if (strcmp(mode, "exit") == 0) return 0;
  if (strcmp(mode, "ran") == 0) return write(9, "R", 1) != 1;
  // What the parent below leaves its child: SIGPIPE ignored, SIGHUP blocked,
  // and SIGTERM, which it handles, at its default action.
  if (strcmp(mode, "inherited") == 0)
    return handler_is(SIGPIPE, SIG_IGN) && blocked(SIGHUP) && handler_is(SIGTERM, SIG_DFL) ? 0 : 1;
  // The same with the attributes resetting SIGPIPE and the mask.
  if (strcmp(mode, "reset") == 0)
    return handler_is(SIGPIPE, SIG_DFL) && !blocked(SIGHUP) ? 0 : 1;
  if (argc != 1) return 2;

  const struct sigaction handler = {.sa_handler = note};
  sigset_t hangup, none, pipe_only;
  sigemptyset(&hangup);
  sigaddset(&hangup, SIGHUP);
  sigemptyset(&none);
  sigemptyset(&pipe_only);
  sigaddset(&pipe_only, SIGPIPE);
  CHECK(signal(SIGPIPE, SIG_IGN) != SIG_ERR && sigaction(SIGTERM, &handler, NULL) == 0);
  CHECK(sigprocmask(SIG_BLOCK, &hangup, NULL) == 0);
  CHECK(run(argv[0], NULL, "inherited") == 0);
  posix_spawnattr_t attributes;
  CHECK(posix_spawnattr_init(&attributes) == 0 &&
        posix_spawnattr_setflags(&attributes, POSIX_SPAWN_SETSIGDEF | POSIX_SPAWN_SETSIGMASK) == 0 &&
        posix_spawnattr_setsigdefault(&attributes, &pipe_only) == 0 &&
        posix_spawnattr_setsigmask(&attributes, &none) == 0);
  CHECK(run(argv[0], &attributes, "reset") == 0);
  CHECK(posix_spawnattr_destroy(&attributes) == 0 && sigprocmask(SIG_SETMASK, &none, NULL) == 0);

  // More children than the process table has slots, each saying on
  // descriptor 9 that it ran: each is reaped as it ends, and wait finds none.
  CHECK(signal(SIGCHLD, SIG_IGN) != SIG_ERR);
  int ran[2];
  CHECK(pipe(ran) == 0 && ran[0] != 9 && dup2(ran[1], 9) == 9 && close(ran[1]) == 0);
  char *arguments[] = {argv[0], "ran", NULL};
  int spawned = 0, error = 0;
  for (pid_t pid; spawned < 80 && (error = posix_spawn(&pid, argv[0], NULL, NULL, arguments, environ)) == 0;) ++spawned;
  if (spawned != 80) fprintf(stderr, "DISPOSITIONS: %d of 80 spawned, then error %d\n", spawned, error);
  CHECK(spawned == 80 && close(9) == 0);
  CHECK(wait(NULL) == -1 && errno == ECHILD);
  char said[81];
  CHECK(read(ran[0], said, sizeof(said)) == 80 && close(ran[0]) == 0);
  CHECK(signal(SIGCHLD, SIG_DFL) == SIG_IGN && run(argv[0], NULL, "exit") == 0);
  if (failures) return 1;
  puts("PROCESS-DISPOSITIONS-OK");
  return 0;
}
