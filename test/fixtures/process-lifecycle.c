#define _GNU_SOURCE
#include <dolly/runtime.h>
#include <dolly/process.h>
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

static int failures;
#define CHECK(condition) do { if (!(condition)) { \
  fprintf(stderr, "LIFECYCLE FAIL line %d: %s (errno %d)\n", __LINE__, #condition, errno); \
  ++failures; } } while (0)

static double now(void) {
  struct timespec value;
  clock_gettime(CLOCK_MONOTONIC, &value);
  return value.tv_sec + value.tv_nsec / 1e9;
}

static int child(const char *path, const char *mode) {
  int output[2];
  if (pipe(output) != 0) return -1;
  char *arguments[] = {(char *)path, (char *)mode, NULL};
  const int pid = dolly_spawn(path, 2, arguments, 0, output[1], 2);
  close(output[1]);
  if (pid >= 0) {
    FILE *stream = fdopen(output[0], "r");
    int reported_pid = -1, parent = -1;
    CHECK(fscanf(stream, "%d %d", &reported_pid, &parent) == 2);
    CHECK(reported_pid == pid);
    CHECK(parent == getpid());
    fclose(stream);
  } else close(output[0]);
  return pid;
}

int main(int argc, char **argv) {
  if (argc > 1) {
    printf("%d %d\n", getpid(), getppid());
    fflush(stdout);
    if (strcmp(argv[1], "exit130") == 0) return 130;
    if (strcmp(argv[1], "cwd") == 0) {
      char directory[4096];
      return getcwd(directory, sizeof(directory)) != NULL && strcmp(directory, "/tmp") == 0 ? 0 : 1;
    }
    if (strcmp(argv[1], "self") == 0) { kill(getpid(), SIGTERM); return 99; }
    if (strcmp(argv[1], "checkpoint") == 0) for (;;) dolly_interrupt_checkpoint();
    if (strcmp(argv[1], "spin") == 0) for (;;) __asm__ volatile("");
    struct timespec delay = {30, 0};
    nanosleep(&delay, NULL);
    return 42;
  }
  CHECK(gettid() == getpid());
  FILE *file = tmpfile();
  CHECK(file != NULL);
  if (file == NULL) return 1;
  CHECK(fputs("abc", file) >= 0);
  rewind(file);
  flockfile(file);
  CHECK(fgetc(file) == 'a');
  CHECK(ftell(file) == 1);
  CHECK(ftrylockfile(file) == 0);
  funlockfile(file);
  funlockfile(file);
  CHECK(fclose(file) == 0);
  const int pid = child(argv[0], "sleep");
  CHECK(pid > 0);
  if (pid <= 0) return 1;
  int status = -1;
  dolly_process_wait_request invalid_wait = {(uint32_t)pid, 2};
  dolly_process_wait_response response;
  CHECK(dolly_process_call(DOLLY_PROCESS_WAIT, &invalid_wait, sizeof(invalid_wait),
                          &response, sizeof(response)) == -EINVAL);
  dolly_process_exit_request invalid_exit = {0, SIGTERM};
  CHECK(dolly_process_call(DOLLY_PROCESS_EXIT, &invalid_exit, sizeof(invalid_exit), NULL, 0) == -EINVAL);
  const double started = now();
  CHECK(waitpid(pid, &status, WNOHANG) == 0);
  CHECK(now() - started < 0.5);
  CHECK(status == -1);
  CHECK(kill(pid, 0) == 0);
  errno = 0;
  CHECK(kill(pid, SIGUSR1) == -1 && errno == ENOTSUP);
  errno = 0;
  CHECK(kill(-1, SIGTERM) == -1 && errno == ENOTSUP);
  CHECK(kill(pid, SIGTERM) == 0);
  if (failures) return 1; /* The invocation boundary owns any remaining children. */
  CHECK(waitpid(pid, &status, 0) == pid);
  CHECK(WIFSIGNALED(status) && WTERMSIG(status) == SIGTERM);
  errno = 0;
  CHECK(waitpid(pid, &status, WNOHANG) == -1 && errno == ECHILD);
  errno = 0;
  CHECK(kill(pid, 0) == -1 && errno == ESRCH);

  const int exited = child(argv[0], "exit130");
  CHECK(waitpid(exited, &status, 0) == exited);
  CHECK(WIFEXITED(status) && WEXITSTATUS(status) == 130);
  const int spinning = child(argv[0], "spin");
  CHECK(kill(spinning, SIGKILL) == 0);
  CHECK(waitpid(spinning, &status, 0) == spinning);
  CHECK(WIFSIGNALED(status) && WTERMSIG(status) == SIGKILL);
  char directory[4096], after[4096];
  CHECK(getcwd(directory, sizeof(directory)) != NULL);
  char *cwd_arguments[] = {argv[0], "cwd", NULL};
  const int cwd_child = dolly_spawn_env_cwd(argv[0], 2, cwd_arguments, NULL, "/tmp", 0, 1, 2, -1);
  CHECK(cwd_child > 0);
  CHECK(getcwd(after, sizeof(after)) != NULL && strcmp(after, directory) == 0);
  CHECK(waitpid(cwd_child, &status, 0) == cwd_child && WIFEXITED(status) && WEXITSTATUS(status) == 0);
  CHECK(dolly_spawn_env_cwd(argv[0], 2, cwd_arguments, NULL, "/dev/null", 0, 1, 2, -1) == -ENOTDIR);
  for (int index = 0; index < 2; ++index) {
    const int interrupted = child(argv[0], index == 0 ? "sleep" : "checkpoint");
    CHECK(kill(interrupted, SIGINT) == 0);
    CHECK(waitpid(interrupted, &status, 0) == interrupted);
    CHECK(WIFSIGNALED(status) && WTERMSIG(status) == SIGINT);
  }
  const int self = child(argv[0], "self");
  CHECK(waitpid(self, &status, 0) == self);
  CHECK(WIFSIGNALED(status) && WTERMSIG(status) == SIGTERM);
  char *arguments[] = {argv[0], "spin", NULL};
  const int pending = dolly_spawn(argv[0], 2, arguments, 0, 1, 2);
  CHECK(pending > 0);
  CHECK(kill(pending, SIGKILL) == 0);
  CHECK(waitpid(pending, &status, 0) == pending);
  CHECK(WIFSIGNALED(status) && WTERMSIG(status) == SIGKILL);
  if (failures) return 1;
  puts("PROCESS-LIFECYCLE-OK");
  return 0;
}
