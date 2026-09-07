#include "uv.h"
#include "internal.h"
#include <dolly/runtime.h>
#include <fcntl.h>
#include <limits.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>

extern char** environ;

static int executable_path(const uv_process_options_t* options,
                           const char* cwd, char resolved[PATH_MAX]) {
  const char* path = NULL;
  char candidate[PATH_MAX];
  if (strchr(options->file, '/')) {
    int size = options->file[0] == '/'
        ? snprintf(candidate, sizeof(candidate), "%s", options->file)
        : snprintf(candidate, sizeof(candidate), "%s/%s", cwd, options->file);
    if (size < 0 || (size_t)size >= sizeof(candidate)) return UV_ENAMETOOLONG;
    return realpath(candidate, resolved) ? 0 : UV__ERR(errno);
  }
  for (char** env = options->env ? options->env : environ; env && *env; env++)
    if (strncmp(*env, "PATH=", 5) == 0) { path = *env + 5; break; }
  if (!path) path = "/usr/bin:/bin";
  do {
    const char* colon = strchr(path, ':');
    size_t length = colon ? (size_t)(colon - path) : strlen(path);
    if (length >= PATH_MAX) return UV_ENAMETOOLONG;
    int size = path[0] == '/' && length
        ? snprintf(candidate, sizeof(candidate), "%.*s/%s", (int)length, path, options->file)
        : snprintf(candidate, sizeof(candidate), "%s/%.*s%s%s", cwd,
                   (int)length, path, length ? "/" : "", options->file);
    if (size < 0 || (size_t)size >= sizeof(candidate)) return UV_ENAMETOOLONG;
    if (realpath(candidate, resolved)) {
      struct stat info;
      if (stat(resolved, &info) == 0 && S_ISREG(info.st_mode)) return 0;
    }
    if (!colon) break;
    path = colon + 1;
  } while (1);
  return UV_ENOENT;
}

static void reap_children(uv_timer_t* timer) {
  uv_loop_t* loop = timer->loop;
  struct uv__queue pending;
  uv__queue_init(&pending);
  struct uv__queue* q = uv__queue_head(&loop->process_handles);
  while (q != &loop->process_handles) {
    uv_process_t* child = uv__queue_data(q, uv_process_t, queue);
    q = uv__queue_next(q);
    int status;
    pid_t result = waitpid(child->pid, &status, WNOHANG);
    if (result == 0 || (result < 0 && errno == EINTR)) continue;
    if (result < 0) {
      /* A caller which steals the wait status owns reaping that child. */
      assert(errno == ECHILD);
      uv__queue_remove(&child->queue);
      uv__queue_init(&child->queue);
      uv__handle_stop(child);
      continue;
    }
    child->status = status;
    uv__queue_remove(&child->queue);
    uv__queue_insert_tail(&pending, &child->queue);
  }
  while (!uv__queue_empty(&pending)) {
    uv_process_t* child = uv__queue_data(uv__queue_head(&pending), uv_process_t, queue);
    uv__queue_remove(&child->queue);
    uv__queue_init(&child->queue);
    uv__handle_stop(child);
    if (child->exit_cb)
      child->exit_cb(child, WIFEXITED(child->status) ? WEXITSTATUS(child->status) : 0,
                    WIFSIGNALED(child->status) ? WTERMSIG(child->status) : 0);
  }
  if (uv__queue_empty(&loop->process_handles)) uv_timer_stop(timer);
}

int uv__process_init(uv_loop_t* loop) {
  int result = uv_timer_init(loop, &loop->child_poll);
  if (result != 0) return result;
  uv_unref((uv_handle_t*)&loop->child_poll);
  loop->child_poll.flags |= UV_HANDLE_INTERNAL;
  return 0;
}

void uv__dolly_process_cleanup(uv_loop_t* loop) {
  if (loop->child_poll.type != UV_TIMER) return;
  uv_timer_stop(&loop->child_poll);
  uv__queue_remove(&loop->child_poll.handle_queue);
}

int uv_spawn(uv_loop_t* loop, uv_process_t* child,
             const uv_process_options_t* options) {
  uv__handle_init(loop, (uv_handle_t*)child, UV_PROCESS);
  uv__queue_init(&child->queue);
  child->pid = 0;
  child->status = 0;
  child->exit_cb = NULL;
  if (!options || !options->file || !options->args || !options->args[0] ||
      options->stdio_count < 0 || (options->stdio_count && !options->stdio))
    return UV_EINVAL;
  /* Windows-only path, quoting and UI hints do not change POSIX spawn.
     Detached lifetimes and uid/gid changes are not implemented by Dolly. */
  const unsigned accepted = UV_PROCESS_WINDOWS_HIDE |
      UV_PROCESS_WINDOWS_HIDE_CONSOLE | UV_PROCESS_WINDOWS_HIDE_GUI |
      UV_PROCESS_WINDOWS_VERBATIM_ARGUMENTS | UV_PROCESS_WINDOWS_FILE_PATH_EXACT_NAME;
  if (options->flags & ~accepted) return UV_ENOTSUP;
  char cwd[PATH_MAX], executable[PATH_MAX];
  if (!realpath(options->cwd ? options->cwd : ".", cwd)) return UV__ERR(errno);
  int result = executable_path(options, cwd, executable);
  if (result != 0) return result;
  int count = options->stdio_count < 3 ? 3 : options->stdio_count;
  if ((size_t)count > DOLLY_PROCESS_PACKET_LIMIT / sizeof(dolly_process_fd_mapping))
    return UV_E2BIG;
  dolly_process_fd_mapping* mappings = uv__calloc(count, sizeof(*mappings));
  struct owned_stdio { int fd; uv_stream_t* stream; };
  struct owned_stdio* owned = uv__calloc(count, sizeof(*owned));
  if (!mappings || !owned) { uv__free(mappings); uv__free(owned); return UV_ENOMEM; }
  for (int i = 0; i < count; i++) owned[i].fd = -1;
  uint32_t mapping_count = 0;
  for (int i = 0; i < count; i++) {
    uv_stdio_container_t spec = {0};
    if (i < options->stdio_count) spec = options->stdio[i];
    if (spec.flags & ~(UV_CREATE_PIPE | UV_INHERIT_FD | UV_INHERIT_STREAM |
                       UV_READABLE_PIPE | UV_WRITABLE_PIPE | UV_NONBLOCK_PIPE)) {
      result = UV_ENOTSUP; goto done;
    }
    int fd = -1;
    switch (spec.flags & (UV_CREATE_PIPE | UV_INHERIT_FD | UV_INHERIT_STREAM)) {
      case UV_IGNORE:
        if (i >= 3) continue;
        fd = open("/dev/null", i == 0 ? O_RDONLY : O_WRONLY);
        if (fd < 0) { result = UV__ERR(errno); goto done; }
        owned[i].fd = fd;
        break;
      case UV_INHERIT_FD: fd = spec.data.fd; break;
      case UV_INHERIT_STREAM:
        if (!spec.data.stream) { result = UV_EINVAL; goto done; }
        result = uv_fileno((uv_handle_t*)spec.data.stream, &fd);
        if (result != 0) goto done;
        break;
      case UV_CREATE_PIPE: {
        unsigned direction = spec.flags & (UV_READABLE_PIPE | UV_WRITABLE_PIPE);
        if (direction != UV_READABLE_PIPE && direction != UV_WRITABLE_PIPE) {
          result = UV_ENOTSUP; goto done;
        }
        if (!spec.data.stream || spec.data.stream->type != UV_NAMED_PIPE ||
            ((uv_pipe_t*)spec.data.stream)->ipc) { result = UV_ENOTSUP; goto done; }
        int pair[2];
        int readable = direction == UV_READABLE_PIPE;
        unsigned child_flags = spec.flags & UV_NONBLOCK_PIPE;
        result = uv_pipe(pair, readable ? child_flags : UV_NONBLOCK_PIPE,
                         readable ? UV_NONBLOCK_PIPE : child_flags);
        if (result != 0) goto done;
        fd = pair[readable ? 0 : 1];
        owned[i].fd = fd;
        int parent = pair[readable ? 1 : 0];
        result = uv_pipe_open((uv_pipe_t*)spec.data.stream, parent);
        if (result != 0) { close(parent); goto done; }
        owned[i].stream = spec.data.stream;
        break;
      }
      default: result = UV_EINVAL; goto done;
    }
    if (fd < 0) { result = UV_EBADF; goto done; }
    mappings[mapping_count++] = (dolly_process_fd_mapping){(uint32_t)fd, (uint32_t)i};
  }
  int argc = 0;
  while (options->args[argc]) argc++;
  result = dolly_spawn_mapped(executable, argc, options->args,
      options->env ? options->env : environ, cwd,
      DOLLY_PROCESS_INHERIT_FDS_NONE, mappings, mapping_count, -1);
  if (result < 0) { result = uv_translate_sys_error(result); goto done; }
  child->pid = result;
  child->exit_cb = options->exit_cb;
  uv__queue_insert_tail(&loop->process_handles, &child->queue);
  uv__handle_start(child);
  uv_timer_start(&loop->child_poll, reap_children, 1, 10);
  result = 0;
done:
  for (int i = 0; i < count; i++) {
    if (owned[i].fd >= 0) close(owned[i].fd);
    if (result && owned[i].stream) uv__stream_close(owned[i].stream);
  }
  uv__free(owned);
  uv__free(mappings);
  return result;
}

int uv_kill(int pid, int signum) {
  return kill(pid, signum) == 0 ? 0 : UV__ERR(errno);
}

int uv_process_kill(uv_process_t* child, int signum) {
  return uv_kill(child->pid, signum);
}

void uv__process_close(uv_process_t* child) {
  uv__queue_remove(&child->queue);
  uv__queue_init(&child->queue);
  uv__handle_stop(child);
  if (uv__queue_empty(&child->loop->process_handles))
    uv_timer_stop(&child->loop->child_poll);
}
