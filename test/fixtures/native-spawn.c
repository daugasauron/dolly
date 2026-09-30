// Native test stand-in for Dolly's spawn/wait contract: posix_spawn with the
// kernel's packet limit and deadline status 124. Never linked into Dolly.
#define _GNU_SOURCE
#include <errno.h>
#include <signal.h>
#include <spawn.h>
#include <string.h>
#include <sys/wait.h>
#include <time.h>
#include <dolly/runtime.h>

static double deadline = -1;

static double now(void) {
  struct timespec value;
  clock_gettime(CLOCK_MONOTONIC, &value);
  return (double)value.tv_sec * 1e3 + (double)value.tv_nsec / 1e6;
}

int dolly_spawn_env_cwd(const char *path, int argc, char **argv, char *const envp[],
                        const char *cwd, int stdin_fd, int stdout_fd, int stderr_fd,
                        double timeout_milliseconds) {
  size_t bytes = strlen(path);
  for (int index = 0; index < argc; index++) bytes += strlen(argv[index]) + 1;
  for (int index = 0; envp[index] != NULL; index++) bytes += strlen(envp[index]) + 1;
  if (path[0] != '/' || cwd != NULL || stdin_fd != 0 || stdout_fd != 1 || stderr_fd != 2 ||
      timeout_milliseconds < -1) return -EINVAL;
  if (bytes > DOLLY_PROCESS_PACKET_LIMIT) return -E2BIG;
  pid_t pid;
  const int error = posix_spawn(&pid, path, NULL, NULL, argv, envp);
  if (error != 0) return -error;
  deadline = timeout_milliseconds < 0 ? -1 : now() + timeout_milliseconds;
  return pid;
}

int dolly_wait(int pid, int *status) {
  int raw;
  while (waitpid(pid, &raw, deadline < 0 ? 0 : WNOHANG) == 0) {
    if (now() >= deadline) {
      kill(pid, SIGKILL);
      waitpid(pid, &raw, 0);
      *status = 124;
      return 0;
    }
    nanosleep(&(struct timespec){.tv_nsec = 1000000}, NULL);
  }
  *status = WIFEXITED(raw) ? WEXITSTATUS(raw) : 128 + WTERMSIG(raw);
  return 0;
}
