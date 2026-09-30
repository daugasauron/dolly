#define _GNU_SOURCE
#include <dolly/runtime.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <signal.h>
#include <spawn.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

/* Pinned Emscripten musl src/process/fdop.h. Only DUP2 and CHDIR are
 * representable by this initial adapter; reject other actions before spawn. */
struct fdop {
  struct fdop *next, *prev;
  int cmd, fd, srcfd, oflag;
  mode_t mode;
  char path[];
};

static int absolute_path(char output[PATH_MAX], const char *cwd, const char *path) {
  const int length = path[0] == '/' ? snprintf(output, PATH_MAX, "%s", path)
                                  : snprintf(output, PATH_MAX, "%s/%s", cwd, path);
  return length < 0 || length >= PATH_MAX ? ENAMETOOLONG : 0;
}

static int supported_signals(const posix_spawnattr_t *attr) {
  const int flags = attr ? attr->__flags : 0;
  if (flags & ~(POSIX_SPAWN_SETSIGDEF | POSIX_SPAWN_SETSIGMASK | POSIX_SPAWN_USEVFORK))
    return ENOTSUP;
  if (attr && attr->__fn) return ENOTSUP;
  sigset_t mask;
  if (flags & POSIX_SPAWN_SETSIGMASK) mask = attr->__mask;
  else if (sigprocmask(SIG_SETMASK, NULL, &mask)) return errno;
  for (int number = 1; number < _NSIG; ++number) {
    if (number == SIGKILL || number == SIGSTOP) continue;
    if (sigismember(&mask, number) == 1) return ENOTSUP;
    struct sigaction action;
    if (sigaction(number, NULL, &action)) return errno;
    if (action.sa_handler == SIG_IGN &&
        (!(flags & POSIX_SPAWN_SETSIGDEF) || sigismember(&attr->__def, number) != 1))
      return ENOTSUP;
  }
  return 0;
}

static int spawn_command(pid_t *pid, const char *program,
    const posix_spawn_file_actions_t *actions, const posix_spawnattr_t *attr,
    char *const argv[], char *const envp[], int search) {
  if (!pid || !program || !argv || !argv[0] || !envp) return EINVAL;
  if (!*program) return ENOENT;
  int error = supported_signals(attr);
  if (error) return error;
  int argc = 0;
  while (argv[argc]) {
    if (++argc >= DOLLY_PROCESS_PACKET_LIMIT) return E2BIG;
  }
  struct fdop *last = actions ? actions->__actions : NULL;
  size_t count = 0;
  for (struct fdop *op = last; op; op = op->next) {
    if (op->cmd != 2 && op->cmd != 4) return ENOTSUP;
    if (++count > DOLLY_PROCESS_PACKET_LIMIT / sizeof(dolly_process_fd_mapping)) return E2BIG;
    last = op;
  }
  dolly_process_fd_mapping *maps = count ? calloc(count, sizeof(*maps)) : NULL;
  if (count && !maps) return ENOMEM;
  uint32_t used = 0;
  char cwd[PATH_MAX], path[PATH_MAX];
  if (!getcwd(cwd, sizeof(cwd))) { error = errno; goto done; }
  for (struct fdop *op = last; op; op = op->prev) {
    if (op->cmd == 4) {
      if ((error = absolute_path(path, cwd, op->path))) goto done;
      if (!realpath(path, cwd)) { error = errno; goto done; }
      struct stat info;
      if (stat(cwd, &info)) { error = errno; goto done; }
      if (!S_ISDIR(info.st_mode)) { error = ENOTDIR; goto done; }
    } else {
      if (op->srcfd < 0 || op->fd < 0) { error = EBADF; goto done; }
      uint32_t source = op->srcfd, target = op->fd, index;
      for (index = 0; index < used; ++index)
        if (maps[index].target_descriptor == source) { source = maps[index].source_descriptor; break; }
      if (fcntl(source, F_GETFD) < 0) { error = errno; goto done; }
      for (index = 0; index < used; ++index)
        if (maps[index].target_descriptor == target) break;
      maps[index] = (dolly_process_fd_mapping){source, target};
      if (index == used) ++used;
    }
  }
  const char *entry = search && !strchr(program, '/') ? getenv("PATH") : NULL;
  if (search && !strchr(program, '/') && !entry) entry = "/bin:/usr/bin";
  for (;;) {
    const char *end = entry ? strchr(entry, ':') : NULL;
    char relative[PATH_MAX];
    if (entry) {
      const size_t length = end ? (size_t)(end - entry) : strlen(entry);
      if (length >= PATH_MAX) { error = ENAMETOOLONG; goto done; }
      const int size = snprintf(relative, sizeof(relative), "%.*s%s%s", (int)length,
                                 entry, length ? "/" : "", program);
      if (size < 0 || size >= PATH_MAX) { error = ENAMETOOLONG; goto done; }
    }
    if ((error = absolute_path(path, cwd, entry ? relative : program))) goto done;
    const int child = dolly_spawn_mapped(path, argc, (char **)argv, envp, cwd,
        DOLLY_PROCESS_INHERIT_FDS_ALL, maps, used, -1);
    if (child > 0) { *pid = child; error = 0; break; }
    error = child < 0 ? -child : EIO;
    if (!end || (error != ENOENT && error != ENOTDIR)) break;
    entry = end + 1;
  }
done:
  free(maps);
  return error;
}

int posix_spawn(pid_t *restrict pid, const char *restrict path,
    const posix_spawn_file_actions_t *actions, const posix_spawnattr_t *restrict attr,
    char *const argv[restrict], char *const envp[restrict]) {
  return spawn_command(pid, path, actions, attr, argv, envp, 0);
}

int posix_spawnp(pid_t *restrict pid, const char *restrict program,
    const posix_spawn_file_actions_t *actions, const posix_spawnattr_t *restrict attr,
    char *const argv[restrict], char *const envp[restrict]) {
  return spawn_command(pid, program, actions, attr, argv, envp, 1);
}
