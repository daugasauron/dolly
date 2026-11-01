// exec replaces a process's program: the pid, parent, descriptors without
// FD_CLOEXEC, the signal mask, ignored and pending signals and the alarm stay;
// handlers go. Each mode but check is run by another, mostly through exec.
#define _GNU_SOURCE
#include <dolly/process.h>
#include <errno.h>
#include <stdint.h>
#include <fcntl.h>
#include <pthread.h>
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

extern char **environ;
static int failures;
#define CHECK(condition) do { if (!(condition)) { \
  fprintf(stderr, "EXEC FAIL line %d: %s (errno %d)\n", __LINE__, #condition, errno); \
  ++failures; } } while (0)

static char self[4096];
static volatile sig_atomic_t received;
static void note(int number) { received = number; }

static int handler_is(int number, void (*handler)(int)) {
  struct sigaction action;
  return sigaction(number, NULL, &action) == 0 && action.sa_handler == handler;
}

// Spawns this program in `mode` with `actions`, and returns its status.
static int run(const posix_spawn_file_actions_t *actions, const char *mode, const char *argument) {
  char *arguments[] = {self, (char *)mode, (char *)argument, NULL};
  pid_t pid;
  const int error = posix_spawn(&pid, self, actions, NULL, arguments, environ);
  if (error != 0) return -error;
  int status;
  CHECK(waitpid(pid, &status, 0) == pid);
  return status;
}

static int exec_self(const char *mode, const char *first, const char *second) {
  execl(self, self, mode, first, second, (char *)NULL);
  return 90;
}

static void *exec_from_thread(void *pid) {
  exec_self("after-thread", pid, NULL);
  return NULL;
}

int main(int argc, char **argv) {
  const ssize_t length = readlink("/proc/self/exe", self, sizeof(self) - 1);
  if (length <= 0) return 2;
  self[length] = 0;
  const char *mode = argc > 1 ? argv[1] : "";
  char pid[16], parent[16];
  snprintf(pid, sizeof(pid), "%d", getpid());
  snprintf(parent, sizeof(parent), "%d", getppid());

  if (strcmp(mode, "before") == 0) {
    // What the next program gets: a descriptor, its mask, ignored and pending
    // signals; not the descriptor marked CLOEXEC, nor the handlers.
    if (dup2(open("/proc/processes", O_RDONLY), 5) != 5) return 3;
    if (dup3(open("/proc/processes", O_RDONLY), 6, O_CLOEXEC) != 6) return 4;
    const struct sigaction handler = {.sa_handler = note};
    sigset_t terminate;
    sigemptyset(&terminate);
    sigaddset(&terminate, SIGTERM);
    if (signal(SIGHUP, SIG_IGN) == SIG_ERR || sigaction(SIGTERM, &handler, NULL) != 0 ||
        sigaction(SIGQUIT, &handler, NULL) != 0 || sigprocmask(SIG_BLOCK, &terminate, NULL) != 0 ||
        raise(SIGTERM) != 0 || received) return 5;
    return exec_self("after", pid, parent);
  }
  if (strcmp(mode, "after") == 0) {
    CHECK(argc == 4 && strcmp(argv[2], pid) == 0 && strcmp(argv[3], parent) == 0);
    CHECK(fcntl(5, F_GETFD) == 0);
    CHECK(fcntl(6, F_GETFD) == -1 && errno == EBADF);
    CHECK(handler_is(SIGTERM, SIG_DFL) && handler_is(SIGQUIT, SIG_DFL) && handler_is(SIGHUP, SIG_IGN));
    sigset_t blocked, pending;
    CHECK(sigprocmask(SIG_BLOCK, NULL, &blocked) == 0 && sigismember(&blocked, SIGTERM) == 1);
    CHECK(sigpending(&pending) == 0 && sigismember(&pending, SIGTERM) == 1);
    // The pending SIGTERM reaches this program's handler once it unblocks it.
    const struct sigaction handler = {.sa_handler = note};
    CHECK(sigaction(SIGTERM, &handler, NULL) == 0 && sigprocmask(SIG_UNBLOCK, &blocked, NULL) == 0);
    CHECK(received == SIGTERM);
    CHECK(kill(getpid(), SIGHUP) == 0);
    return failures ? 1 : 42;
  }
  if (strcmp(mode, "closed") == 0) return fcntl(7, F_GETFD) == -1 && errno == EBADF ? 0 : 1;
  if (strcmp(mode, "opened") == 0) {
    char bytes[6];
    return read(8, bytes, sizeof(bytes)) == 6 && memcmp(bytes, "hello\n", 6) == 0 ? 0 : 1;
  }
  if (strcmp(mode, "moved") == 0) return fcntl(7, F_GETFD) == -1 && fcntl(9, F_GETFD) == 0 ? 0 : 1;
  // Built with -pthread: a thread other than the first execs.
  if (strcmp(mode, "thread") == 0) {
    pthread_t thread;
    if (pthread_create(&thread, NULL, exec_from_thread, pid) != 0) return 3;
    sleep(30);
    return 4;
  }
  if (strcmp(mode, "after-thread") == 0) return argc == 3 && strcmp(argv[2], pid) == 0 ? 43 : 1;
  // A due alarm reaches the next program: its default action ends it, or,
  // ignored across exec, it is nothing.
  if (strcmp(mode, "alarm") == 0 || strcmp(mode, "alarm-ignored") == 0) {
    if (mode[5] && signal(SIGALRM, SIG_IGN) == SIG_ERR) return 3;
    alarm(1);
    return exec_self("after-alarm", NULL, NULL);
  }
  if (strcmp(mode, "after-alarm") == 0) {
    sleep(3);
    return 44;
  }
  if (strcmp(mode, "environment") == 0) {
    char *const environment[] = {"EXEC_VARIABLE=kept", NULL};
    execle(self, self, "after-environment", (char *)NULL, environment);
    return 90;
  }
  if (strcmp(mode, "after-environment") == 0)
    return getenv("PATH") == NULL && strcmp(getenv("EXEC_VARIABLE"), "kept") == 0 ? 45 : 1;
  // At the terminal: Ctrl+C reaches the program exec started.
  if (strcmp(mode, "interrupt") == 0) return exec_self("after-interrupt", NULL, NULL);
  if (strcmp(mode, "after-interrupt") == 0) {
    const struct sigaction handler = {.sa_handler = note};
    if (sigaction(SIGINT, &handler, NULL) != 0) return 3;
    puts("EXEC-INTERRUPT-READY");
    fflush(stdout);
    pause();
    return received == SIGINT ? 0 : 7;
  }
  // Standard output stays the pipe it was.
  if (strcmp(mode, "pipe") == 0) {
    puts("BEFORE");
    fflush(stdout);
    return exec_self("after-pipe", NULL, NULL);
  }
  if (strcmp(mode, "after-pipe") == 0) return puts("AFTER") < 0;
  // A program ignores SIGHUP, as nohup does, says so on descriptor 3 and
  // execs: the signal stays ignored while the next program starts.
  if (strcmp(mode, "hangup") == 0) {
    if (signal(SIGHUP, SIG_IGN) == SIG_ERR || write(3, "i", 1) != 1) return 3;
    return exec_self("after-hangup", NULL, NULL);
  }
  if (strcmp(mode, "after-hangup") == 0) {
    usleep(200000);
    return handler_is(SIGHUP, SIG_IGN) ? 46 : 1;
  }
  // Under a timed spawn the deadline ends the program exec started.
  if (strcmp(mode, "deadline") == 0) {
    execlp("sleep", "sleep", "30", (char *)NULL);
    return 90;
  }
  if (strcmp(mode, "check") != 0 || argc != 4) return 2;

  // What cannot run fails the call, and this program goes on: nothing there,
  // a file that is no program, an executable the loader refuses (argv[3]).
  const char *scratch = argv[2];
  CHECK(execl("/no/such/program", "program", (char *)NULL) == -1 && errno == ENOENT);
  CHECK(chdir(scratch) == 0 && execl("no-such-program", "program", (char *)NULL) == -1 && errno == ENOENT);
  FILE *text = fopen("not-a-program", "w");
  CHECK(text != NULL && fputs("hello\n", text) >= 0 && fclose(text) == 0);
  CHECK(execl("not-a-program", "not-a-program", (char *)NULL) == -1 && errno == ENOEXEC);
  CHECK(execl(argv[3], argv[3], (char *)NULL) == -1 && errno == ENOEXEC);
  char *no_arguments[] = {NULL};
  CHECK(execv(self, no_arguments) == -1 && errno == EINVAL);
  // A path longer than the packet is a malformed request.
  struct { dolly_process_exec_request header; char path[8]; } packet = {
      .header = {.argument_count = 1, .path_size = 4096, .argument_bytes = UINT64_MAX / 2,
                 .environment_bytes = UINT64_MAX / 2 - 4086},
      .path = "/aaaaaaa"};
  CHECK(dolly_process_call(DOLLY_PROCESS_EXEC, &packet, sizeof(packet), NULL, 0) == -EINVAL);

  // The process keeps its pid: the parent waits for the spawned one and gets
  // the status of the program exec started in it.
  char *before[] = {self, "before", NULL};
  pid_t child;
  CHECK(posix_spawn(&child, self, NULL, NULL, before, environ) == 0);
  int status;
  CHECK(waitpid(child, &status, 0) == child && WIFEXITED(status) && WEXITSTATUS(status) == 42);

  // posix_spawn's close actions, in order with dup2.
  CHECK(dup2(open("/proc/processes", O_RDONLY), 7) == 7);
  posix_spawn_file_actions_t actions;
  CHECK(posix_spawn_file_actions_init(&actions) == 0 && posix_spawn_file_actions_addclose(&actions, 7) == 0);
  CHECK(run(&actions, "closed", NULL) == 0);
  CHECK(posix_spawn_file_actions_adddup2(&actions, 7, 9) == 0);
  CHECK(run(&actions, "moved", NULL) == -EBADF);
  CHECK(posix_spawn_file_actions_destroy(&actions) == 0 && posix_spawn_file_actions_init(&actions) == 0);
  CHECK(posix_spawn_file_actions_adddup2(&actions, 7, 9) == 0 &&
        posix_spawn_file_actions_addclose(&actions, 7) == 0);
  CHECK(run(&actions, "moved", NULL) == 0);
  CHECK(posix_spawn_file_actions_destroy(&actions) == 0 && close(7) == 0);
  // An open action opens its file for the child, from the directory a chdir
  // action gave it; a file it cannot open fails the spawn.
  CHECK(posix_spawn_file_actions_init(&actions) == 0 && posix_spawn_file_actions_addchdir_np(&actions, scratch) == 0 &&
        posix_spawn_file_actions_addopen(&actions, 8, "not-a-program", O_RDONLY, 0) == 0);
  CHECK(run(&actions, "opened", NULL) == 0);
  CHECK(posix_spawn_file_actions_addopen(&actions, 9, "no-such-file", O_RDONLY, 0) == 0);
  CHECK(run(&actions, "opened", NULL) == -ENOENT);
  CHECK(posix_spawn_file_actions_destroy(&actions) == 0);

  CHECK(run(NULL, "environment", NULL) == 45 << 8);
  status = run(NULL, "alarm", NULL);
  CHECK(WIFSIGNALED(status) && WTERMSIG(status) == SIGALRM);
  CHECK(run(NULL, "alarm-ignored", NULL) == 44 << 8);

  // A signal the program exec replaced ignored ends no program: hang-ups,
  // sent as fast as they go from the moment the first program ignores them,
  // reach the next one while it starts, runs and exits.
  int ready[2];
  CHECK(pipe(ready) == 0);
  CHECK(posix_spawn_file_actions_init(&actions) == 0 && posix_spawn_file_actions_adddup2(&actions, ready[1], 3) == 0);
  char *hangup[] = {self, "hangup", NULL};
  CHECK(posix_spawn(&child, self, &actions, NULL, hangup, environ) == 0);
  CHECK(posix_spawn_file_actions_destroy(&actions) == 0 && close(ready[1]) == 0);
  char byte;
  CHECK(read(ready[0], &byte, 1) == 1 && close(ready[0]) == 0);
  pid_t waited;
  while ((waited = waitpid(child, &status, WNOHANG)) == 0) CHECK(kill(child, SIGHUP) == 0);
  CHECK(waited == child && WIFEXITED(status) && WEXITSTATUS(status) == 46);
  if (failures) return 1;
  puts("PROCESS-EXEC-OK");
  return 0;
}
