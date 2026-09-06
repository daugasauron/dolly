#define _GNU_SOURCE
#include <dolly/runtime.h>
#include <dolly/process.h>
#include <errno.h>
#include <poll.h>
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

static int read_byte(int descriptor, char expected) {
  struct pollfd ready = {descriptor, POLLIN, 0};
  if (poll(&ready, 1, 5000) != 1) return 0;
  char byte;
  return read(descriptor, &byte, 1) == 1 && byte == expected;
}

static int foreground_child(const char *path, const char *mode) {
  if (strcmp(mode, "foreground-exit") == 0) return 0;
  char directory[4096];
  CHECK(getcwd(directory, sizeof(directory)) != NULL && strcmp(directory, "/tmp") == 0);
  const char *value = getenv("DOLLY_LIFECYCLE_FOREGROUND");
  CHECK(value != NULL && strcmp(value, "inherited") == 0);
  if (strcmp(mode, "foreground-leaf") == 0) {
    CHECK(read_byte(0, 'y'));
    CHECK(write(1, "L", 1) == 1 && write(2, "E", 1) == 1);
    return failures ? 1 : 23;
  }
  CHECK(strcmp(mode, "foreground-root") == 0);
  CHECK(write(1, "R", 1) == 1);
  CHECK(read_byte(0, 'x'));
  for (int index = 0; index < 2; ++index) {
    char *arguments[] = {(char *)path, "foreground-leaf", NULL};
    const int pid = dolly_spawn_foreground(path, 2, arguments, 0);
    CHECK(pid > 0);
    if (pid <= 0) return 1;
    int status = -1;
    CHECK(waitpid(pid, &status, 0) == pid);
    CHECK(WIFEXITED(status) && WEXITSTATUS(status) == 23);
  }
  CHECK(write(1, "F", 1) == 1);
  return failures ? 1 : 37;
}

static void foreground(const char *path) {
  char *arguments[] = {(char *)path, "foreground-exit", NULL};
  CHECK(dolly_spawn_foreground(path, 2, arguments, 2) == -EINVAL);
  CHECK(dolly_spawn_foreground("/no-such-lifecycle-command", 2, arguments, 0) == -ENOENT);
  const size_t path_size = strlen(path), mode_size = strlen(arguments[1]) + 1;
  dolly_process_spawn_request request = {
    .argument_count = 2, .path_size = path_size,
    .argument_bytes = path_size + 1 + mode_size, .deadline_nanoseconds = UINT64_MAX,
  };
  const size_t packet_size = sizeof(request) + path_size + request.argument_bytes;
  unsigned char *packet = malloc(packet_size);
  CHECK(packet != NULL);
  if (packet == NULL) return;
  memcpy(packet + sizeof(request), path, path_size);
  memcpy(packet + sizeof(request) + path_size, path, path_size + 1);
  memcpy(packet + sizeof(request) + 2 * path_size + 1, arguments[1], mode_size);
  const uint32_t invalid_flags[] = {DOLLY_PROCESS_SPAWN_INTERACTIVE, 1u << 31};
  for (unsigned index = 0; index < sizeof(invalid_flags) / sizeof(invalid_flags[0]); ++index) {
    request.flags = DOLLY_PROCESS_SPAWN_INHERIT_ENVIRONMENT | invalid_flags[index];
    memcpy(packet, &request, sizeof(request));
    dolly_process_spawn_response response;
    CHECK(dolly_process_call(DOLLY_PROCESS_SPAWN, packet, packet_size,
                            &response, sizeof(response)) == -EINVAL);
  }
  free(packet);

  int input[2], output[2], errors[2], saved[3];
  CHECK(pipe(input) == 0 && pipe(output) == 0 && pipe(errors) == 0);
  if (failures) return;
  for (int index = 0; index < 3; ++index) {
    saved[index] = dup(index);
    CHECK(saved[index] >= 0);
  }
  char directory[4096];
  CHECK(getcwd(directory, sizeof(directory)) != NULL);
  const char *value = getenv("DOLLY_LIFECYCLE_FOREGROUND");
  char *previous = value == NULL ? NULL : strdup(value);
  CHECK(value == NULL || previous != NULL);
  if (failures) return;
  CHECK(setenv("DOLLY_LIFECYCLE_FOREGROUND", "inherited", 1) == 0);
  CHECK(chdir("/tmp") == 0);
  CHECK(dup2(input[0], 0) == 0 && dup2(output[1], 1) == 1 && dup2(errors[1], 2) == 2);
  arguments[1] = "foreground-root";
  const int pid = dolly_spawn_foreground(path, 2, arguments, 1);
  for (int index = 0; index < 3; ++index) {
    CHECK(dup2(saved[index], index) == index && close(saved[index]) == 0);
  }
  CHECK(chdir(directory) == 0);
  CHECK(previous == NULL ? unsetenv("DOLLY_LIFECYCLE_FOREGROUND") == 0 :
        setenv("DOLLY_LIFECYCLE_FOREGROUND", previous, 1) == 0);
  free(previous);
  CHECK(close(input[0]) == 0 && close(output[1]) == 0 && close(errors[1]) == 0);
  CHECK(pid > 0);
  if (pid > 0) {
    CHECK(read_byte(output[0], 'R'));
    arguments[1] = "foreground-exit";
    CHECK(dolly_spawn_foreground(path, 2, arguments, 0) == -EBUSY);
    CHECK(write(input[1], "xyy", 3) == 3);
    int status = -1;
    CHECK(waitpid(pid, &status, 0) == pid);
    CHECK(WIFEXITED(status) && WEXITSTATUS(status) == 37);
    CHECK(read_byte(output[0], 'L') && read_byte(output[0], 'L') && read_byte(output[0], 'F'));
    CHECK(read_byte(errors[0], 'E') && read_byte(errors[0], 'E'));
  }
  CHECK(close(input[1]) == 0 && close(output[0]) == 0 && close(errors[0]) == 0);
  arguments[1] = "foreground-exit";
  const int restored = dolly_spawn_foreground(path, 2, arguments, 0);
  CHECK(restored > 0);
  if (restored > 0) {
    int status = -1;
    CHECK(waitpid(restored, &status, 0) == restored);
    CHECK(WIFEXITED(status) && WEXITSTATUS(status) == 0);
  }
}

int main(int argc, char **argv) {
  if (argc > 1) {
    if (strncmp(argv[1], "foreground-", 11) == 0) return foreground_child(argv[0], argv[1]);
    printf("%d %d\n", getpid(), getppid());
    fflush(stdout);
    if (strcmp(argv[1], "exit130") == 0) return 130;
    if (strcmp(argv[1], "cwd") == 0) {
      char directory[4096];
      return getcwd(directory, sizeof(directory)) != NULL && strcmp(directory, "/tmp") == 0 ? 0 : 1;
    }
    if (strcmp(argv[1], "orphans") == 0) {
      char *arguments[] = {argv[0], "foreground-exit", NULL};
      if (dolly_spawn(argv[0], 2, arguments, 0, 1, 2) <= 0) return 1;
      struct timespec delay = {0, 100000000};
      nanosleep(&delay, NULL); /* Leave a retired but unreaped child. */
      for (int index = 0; index < 4; ++index) {
        if (dolly_spawn(argv[0], 2, arguments, 0, 1, 2) <= 0) return 1;
      }
      return 0; /* Also abandon children still queued for launch. */
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
  foreground(argv[0]);
  if (failures) return 1;
  for (int index = 0; index < 8; ++index) {
    const int orphan_parent = child(argv[0], "orphans");
    CHECK(orphan_parent > 0);
    CHECK(waitpid(orphan_parent, &status, 0) == orphan_parent);
    CHECK(WIFEXITED(status) && WEXITSTATUS(status) == 0);
    if (failures) return 1;
  }
  puts("PROCESS-LIFECYCLE-OK");
  return 0;
}
