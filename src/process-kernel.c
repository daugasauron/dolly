#include "fs-record.h"
#include "process-kernel.h"

#include <dolly/process.h>
#include <dolly/runtime.h>
#include <dolly/threads.h>

#include <errno.h>
#include <dirent.h>
#include <fcntl.h>
#include <limits.h>
#include <malloc.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

enum {
  DOLLY_KERNEL_PROCESS_LIMIT = 32,
  DOLLY_KERNEL_DESCRIPTOR_LIMIT = 256,
  DOLLY_KERNEL_PROCESS_FREE = 0,
  DOLLY_KERNEL_PROCESS_PENDING = 1,
  DOLLY_KERNEL_PROCESS_RUNNING = 2,
  DOLLY_KERNEL_PROCESS_EXITED = 3,
  DOLLY_KERNEL_EXECUTABLE_LIMIT = 512 * 1024 * 1024,
  DOLLY_KERNEL_PIPE_LIMIT = 64,
  DOLLY_KERNEL_PIPE_CAPACITY = 64 * 1024,
  DOLLY_KERNEL_PIPE_READ = 1,
  DOLLY_KERNEL_PIPE_WRITE = 2,
  DOLLY_KERNEL_SHEBANG_LIMIT = 4096,
  DOLLY_KERNEL_SHEBANG_DEPTH = 4,
  DOLLY_KERNEL_THREAD_LIMIT = 64,
};

static const uint64_t DOLLY_KERNEL_SPAWN_DEADLINE_LIMIT =
    UINT64_C(24) * 60 * 60 * 1000000000;

typedef struct {
  int tid, waiter, waiting_on, retired;
  uint64_t result;
} dolly_kernel_thread;

typedef struct {
  size_t offset;
  size_t size;
  uint32_t readers;
  uint32_t writers;
  unsigned char nonblocking[2]; /* Shared by duplicates of each pipe end. */
  unsigned char bytes[DOLLY_KERNEL_PIPE_CAPACITY];
} dolly_kernel_pipe;

typedef struct {
  int pid;
  int parent_pid;
  int state;
  int status;
  int exit_signal;
  uint32_t spawn_flags;
  int worker_retired;
  int descriptors[DOLLY_KERNEL_DESCRIPTOR_LIMIT];
  unsigned char descriptor_flags[DOLLY_KERNEL_DESCRIPTOR_LIMIT];
  dolly_kernel_pipe *pipes[DOLLY_KERNEL_DESCRIPTOR_LIMIT];
  unsigned char pipe_directions[DOLLY_KERNEL_DESCRIPTOR_LIMIT];
  unsigned char terminal_descriptors[DOLLY_KERNEL_DESCRIPTOR_LIMIT];
  DIR *directories[DOLLY_KERNEL_DESCRIPTOR_LIMIT];
  char **arguments;
  uint32_t argument_count;
  char **environment;
  uint32_t environment_count;
  int current_directory;
  char *path;
  unsigned char *image;
  size_t image_size;
  uint64_t deadline_nanoseconds;
  dolly_kernel_thread threads[DOLLY_KERNEL_THREAD_LIMIT];
  int signal_tid;
  uint32_t pending_signals;
  int handling_signal;
  uint64_t alarm_deadline; /* Monotonic SIGALRM time; zero while disarmed. */
  uint64_t alarm_interval;
  int alarm_handled;
} dolly_kernel_process;

_Alignas(64) static unsigned char
    process_mailbox[DOLLY_PROCESS_PACKET_LIMIT];
static dolly_kernel_process process_table[DOLLY_KERNEL_PROCESS_LIMIT];
static int next_process_pid = 100;
static uint32_t next_thread_tid = 1;
static uint32_t live_pipe_count;
static int foreground_pid;

extern char **environ;
int dolly_process_signal(int pid, int signal_number);

#define DOLLY_KERNEL_MODULE(name) extern const dolly_kernel_module dolly_##name##_kernel;
#include "dolly-kernel-modules.h"
#undef DOLLY_KERNEL_MODULE
#define DOLLY_KERNEL_MODULE(name) &dolly_##name##_kernel,
static const dolly_kernel_module *const kernel_modules[] = {
#include "dolly-kernel-modules.h"
};
#undef DOLLY_KERNEL_MODULE

static void release_modules(int pid, int tid) {
  for (size_t index = 0; index < sizeof(kernel_modules) / sizeof(*kernel_modules); ++index)
    if (kernel_modules[index]->release) kernel_modules[index]->release(pid, tid);
}

static const dolly_kernel_module *module_for(uint32_t operation) {
  for (size_t index = 0; index < sizeof(kernel_modules) / sizeof(*kernel_modules); ++index) {
    const dolly_kernel_module *module = kernel_modules[index];
    if (module->call && operation >= module->first_operation &&
        operation <= module->last_operation) return module;
  }
  return NULL;
}

static dolly_kernel_process *find_process(int pid) {
  for (size_t index = 0; index < DOLLY_KERNEL_PROCESS_LIMIT; ++index) {
    if (process_table[index].state != DOLLY_KERNEL_PROCESS_FREE &&
        process_table[index].pid == pid) {
      return &process_table[index];
    }
  }
  return NULL;
}

static dolly_kernel_thread *find_thread(dolly_kernel_process *process, int tid) {
  if (tid <= 0) return NULL;
  for (size_t i = 0; i < DOLLY_KERNEL_THREAD_LIMIT; ++i)
    if (process->threads[i].tid == tid) return &process->threads[i];
  return NULL;
}

static int allocate_thread(dolly_kernel_process *process) {
  if (next_thread_tid > INT32_MAX) return -EAGAIN;
  for (size_t i = 0; i < DOLLY_KERNEL_THREAD_LIMIT; ++i) {
    if (process->threads[i].tid) continue;
    process->threads[i].tid = (int)next_thread_tid++;
    return process->threads[i].tid;
  }
  return -EAGAIN;
}

static uint64_t clock_nanoseconds(clockid_t clock) {
  struct timespec now;
  return clock_gettime(clock, &now) == 0
      ? (uint64_t)now.tv_sec * UINT64_C(1000000000) + (uint64_t)now.tv_nsec : 0;
}

static uint64_t saturating_add(uint64_t time, uint64_t delay) {
  return delay > UINT64_MAX - time ? UINT64_MAX : time + delay;
}

static int process_clock(uint32_t clock_id, clockid_t *clock) {
  if (clock_id == DOLLY_PROCESS_CLOCK_REALTIME) *clock = CLOCK_REALTIME;
  else if (clock_id == DOLLY_PROCESS_CLOCK_MONOTONIC) *clock = CLOCK_MONOTONIC;
  else return -EINVAL;
  return 0;
}

int dolly_process_descends_from(int pid, int ancestor_pid) {
  if (pid <= 0 || ancestor_pid <= 0) return 0;
  dolly_kernel_process *process = find_process(pid);
  for (size_t depth = 0; process != NULL && depth < DOLLY_KERNEL_PROCESS_LIMIT;
       ++depth) {
    if (process->pid == ancestor_pid) return 1;
    if (process->parent_pid == 0) return 0;
    process = find_process(process->parent_pid);
  }
  return 0;
}

static void refresh_foreground(void) {
  dolly_kernel_process *owner = find_process(foreground_pid);
  while (owner != NULL &&
         (owner->worker_retired ||
          (owner->spawn_flags & DOLLY_PROCESS_SPAWN_FOREGROUND) == 0)) {
    owner = find_process(owner->parent_pid);
  }
  foreground_pid = owner == NULL ? 0 : owner->pid;
  // Termios ISIG: Ctrl+C is SIGINT while it is set and input once cleared.
  dolly_kernel_foreground_publish(foreground_pid,
      owner != NULL && owner->state != DOLLY_KERNEL_PROCESS_EXITED &&
      (dolly_kernel_terminal_mode() & DOLLY_TERMINAL_ISIG) != 0);
}

static void dispose_vector(char ***vector, uint32_t *count) {
  if (*vector != NULL) {
    for (uint32_t index = 0; index < *count; ++index) free((*vector)[index]);
  }
  free(*vector);
  *vector = NULL;
  *count = 0;
}

static char *copy_bytes_string(const unsigned char *bytes, size_t size) {
  char *result = malloc(size + 1);
  if (result == NULL) return NULL;
  memcpy(result, bytes, size);
  result[size] = '\0';
  return result;
}

static int descriptor_is_open(const dolly_kernel_process *process,
                              uint32_t descriptor) {
  return descriptor < DOLLY_KERNEL_DESCRIPTOR_LIMIT &&
      (process->descriptors[descriptor] >= 0 || process->pipes[descriptor] != NULL);
}

static void retain_pipe(dolly_kernel_pipe *pipe, unsigned direction) {
  if (direction == DOLLY_KERNEL_PIPE_READ) ++pipe->readers;
  else if (direction == DOLLY_KERNEL_PIPE_WRITE) ++pipe->writers;
}

static void release_descriptor(dolly_kernel_process *process,
                               uint32_t descriptor) {
  if (descriptor >= DOLLY_KERNEL_DESCRIPTOR_LIMIT) return;
  if (process->directories[descriptor] != NULL) {
    closedir(process->directories[descriptor]);
    process->directories[descriptor] = NULL;
  }
  if (process->descriptors[descriptor] >= 0) {
    close(process->descriptors[descriptor]);
    process->descriptors[descriptor] = -1;
  }
  dolly_kernel_pipe *pipe = process->pipes[descriptor];
  if (pipe != NULL) {
    if (process->pipe_directions[descriptor] == DOLLY_KERNEL_PIPE_READ) {
      if (pipe->readers != 0) --pipe->readers;
    } else if (process->pipe_directions[descriptor] == DOLLY_KERNEL_PIPE_WRITE) {
      if (pipe->writers != 0) --pipe->writers;
    }
    process->pipes[descriptor] = NULL;
    process->pipe_directions[descriptor] = 0;
    if (pipe->readers == 0 && pipe->writers == 0) {
      free(pipe);
      if (live_pipe_count != 0) --live_pipe_count;
    }
  }
  process->terminal_descriptors[descriptor] = 0;
  process->descriptor_flags[descriptor] = 0;
}

static void release_process_resources(dolly_kernel_process *process) {
  release_modules(process->pid, 0);
  memset(process->threads, 0, sizeof(process->threads));
  for (size_t index = 0; index < DOLLY_KERNEL_DESCRIPTOR_LIMIT; ++index) {
    release_descriptor(process, (uint32_t)index);
  }
  dispose_vector(&process->arguments, &process->argument_count);
  dispose_vector(&process->environment, &process->environment_count);
  if (process->current_directory >= 0) close(process->current_directory);
  process->current_directory = -1;
  free(process->path);
  process->path = NULL;
  free(process->image);
  process->image = NULL;
  process->image_size = 0;
}

static void dispose_process(dolly_kernel_process *process) {
  release_process_resources(process);
  memset(process, 0, sizeof(*process));
}

static int supported_signal(uint32_t signal_number) {
  return signal_number == 0 ||
      (signal_number < 32 && ((DOLLY_PROCESS_SIGNAL_MASK >> signal_number) & 1u));
}

/* Signals whose delivery does not end the process. */
static uint32_t notification_signals(const dolly_kernel_process *process) {
  return 1u << DOLLY_PROCESS_SIGCHLD | 1u << DOLLY_PROCESS_SIGWINCH |
      (process->alarm_handled ? 1u << DOLLY_PROCESS_SIGALRM : 0);
}

void dolly_kernel_terminal_resized(void) {
  if (!foreground_pid) return;
  for (size_t index = 0; index < DOLLY_KERNEL_PROCESS_LIMIT; index++) {
    dolly_kernel_process *process = &process_table[index];
    if (process->state == DOLLY_KERNEL_PROCESS_RUNNING &&
        dolly_process_descends_from(process->pid, foreground_pid))
      process->pending_signals |= 1u << DOLLY_PROCESS_SIGWINCH;
  }
}

static int next_signal(const dolly_kernel_process *process) {
  return process->pending_signals ? __builtin_ctz(process->pending_signals) : 0;
}

static void mark_process_exited(dolly_kernel_process *process, int status,
                                int signal_number) {
  if (process->state == DOLLY_KERNEL_PROCESS_EXITED) return;
  const int pid = process->pid;
  for (size_t index = 0; index < DOLLY_KERNEL_PROCESS_LIMIT; ++index) {
    dolly_kernel_process *child = &process_table[index];
    if (child->state == DOLLY_KERNEL_PROCESS_FREE || child->parent_pid != pid) continue;
    mark_process_exited(child, status, signal_number);
  }
  release_process_resources(process);
  process->status = status >= 0 && status <= 255 ? status : 126;
  process->exit_signal = signal_number;
  process->state = DOLLY_KERNEL_PROCESS_EXITED;
  refresh_foreground();
}

static dolly_kernel_process *allocate_process(void) {
  for (size_t index = 0; index < DOLLY_KERNEL_PROCESS_LIMIT; ++index) {
    dolly_kernel_process *process = &process_table[index];
    if (process->state != DOLLY_KERNEL_PROCESS_FREE) continue;
    memset(process, 0, sizeof(*process));
    process->current_directory = -1;
    for (size_t descriptor = 0; descriptor < DOLLY_KERNEL_DESCRIPTOR_LIMIT;
         ++descriptor) {
      process->descriptors[descriptor] = -1;
    }
    process->pid = next_process_pid++;
    if (next_process_pid <= 0) next_process_pid = 100;
    process->state = DOLLY_KERNEL_PROCESS_PENDING;
    return process;
  }
  return NULL;
}

static int read_image_bytes(dolly_kernel_process *process) {
  uintptr_t size;
  if (dolly_fs_read_file(process->path, DOLLY_KERNEL_EXECUTABLE_LIMIT,
                         &process->image, &size) != 0) {
    return errno == EINVAL || errno == EFBIG ? -ENOEXEC : -errno;
  }
  process->image_size = size;
  return size < 8 ? -ENOEXEC : 0;
}

static int redirect_shebang(dolly_kernel_process *process) {
  if (process->image_size < 4 || process->image[0] != '#' ||
      process->image[1] != '!') return -ENOEXEC;
  const size_t limit = process->image_size < DOLLY_KERNEL_SHEBANG_LIMIT
      ? process->image_size : DOLLY_KERNEL_SHEBANG_LIMIT;
  const unsigned char *line_end = memchr(process->image + 2, '\n', limit - 2);
  if (line_end == NULL) return -ENOEXEC;
  const unsigned char *cursor = process->image + 2;
  while (cursor != line_end && (*cursor == ' ' || *cursor == '\t')) ++cursor;
  const unsigned char *interpreter = cursor;
  while (cursor != line_end && *cursor != ' ' && *cursor != '\t' &&
         *cursor != '\r' && *cursor != '\0') ++cursor;
  const size_t interpreter_size = (size_t)(cursor - interpreter);
  if (interpreter_size == 0 || interpreter[0] != '/' ||
      cursor != line_end && *cursor == '\0') return -ENOEXEC;
  while (cursor != line_end && (*cursor == ' ' || *cursor == '\t')) ++cursor;
  const unsigned char *optional = cursor;
  while (line_end != optional &&
         (line_end[-1] == ' ' || line_end[-1] == '\t' ||
          line_end[-1] == '\r')) --line_end;
  if (memchr(optional, '\0', (size_t)(line_end - optional)) != NULL) {
    return -ENOEXEC;
  }
  const size_t optional_size = (size_t)(line_end - optional);
  if (process->argument_count > UINT32_MAX - 1u - (optional_size != 0)) {
    return -E2BIG;
  }
  const uint32_t replacement_count =
      process->argument_count + 1u + (optional_size != 0);
  char **replacement = calloc((size_t)replacement_count + 1,
                              sizeof(*replacement));
  char *replacement_path = copy_bytes_string(interpreter, interpreter_size);
  uint32_t populated = 0;
  if (replacement == NULL || replacement_path == NULL) {
    free(replacement);
    free(replacement_path);
    return -ENOMEM;
  }
  replacement[populated++] = strdup(replacement_path);
  if (optional_size != 0) {
    replacement[populated++] = copy_bytes_string(optional, optional_size);
  }
  replacement[populated++] = strdup(process->path);
  for (uint32_t index = 1;
       index < process->argument_count && populated < replacement_count;
       ++index) {
    replacement[populated++] = strdup(process->arguments[index]);
  }
  for (uint32_t index = 0; index < populated; ++index) {
    if (replacement[index] == NULL) {
      dispose_vector(&replacement, &populated);
      free(replacement_path);
      return -ENOMEM;
    }
  }
  if (populated != replacement_count) {
    dispose_vector(&replacement, &populated);
    free(replacement_path);
    return -EIO;
  }
  dispose_vector(&process->arguments, &process->argument_count);
  process->arguments = replacement;
  process->argument_count = replacement_count;
  free(process->path);
  process->path = replacement_path;
  free(process->image);
  process->image = NULL;
  process->image_size = 0;
  return 0;
}

static int read_image(dolly_kernel_process *process) {
  static const unsigned char wasm_header[8] = {
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  };
  for (unsigned depth = 0; depth <= DOLLY_KERNEL_SHEBANG_DEPTH; ++depth) {
    const int loaded = read_image_bytes(process);
    if (loaded != 0) return loaded;
    if (process->image_size >= sizeof(wasm_header) &&
        memcmp(process->image, wasm_header, sizeof(wasm_header)) == 0) {
      char *canonical = realpath(process->path, NULL);
      if (canonical == NULL) return -errno;
      free(process->path);
      process->path = canonical;
      return 0;
    }
    if (depth == DOLLY_KERNEL_SHEBANG_DEPTH) return -ELOOP;
    const int redirected = redirect_shebang(process);
    if (redirected != 0) return redirected;
  }
  return -ELOOP;
}

static int copy_string_vector(const unsigned char *bytes, size_t size,
                              uint32_t count, char ***output) {
  if ((count == 0) != (size == 0)) return -EINVAL;
  char **vector = calloc((size_t)count + 1, sizeof(*vector));
  if (vector == NULL) return -ENOMEM;
  size_t offset = 0;
  for (uint32_t index = 0; index < count; ++index) {
    if (offset >= size) {
      dispose_vector(&vector, &index);
      return -EINVAL;
    }
    const unsigned char *terminator = memchr(bytes + offset, 0, size - offset);
    if (terminator == NULL) {
      dispose_vector(&vector, &index);
      return -EINVAL;
    }
    const size_t length = (size_t)(terminator - (bytes + offset));
    vector[index] = malloc(length + 1);
    if (vector[index] == NULL) {
      uint32_t populated = index;
      dispose_vector(&vector, &populated);
      return -ENOMEM;
    }
    memcpy(vector[index], bytes + offset, length + 1);
    offset += length + 1;
  }
  if (offset != size) {
    uint32_t populated = count;
    dispose_vector(&vector, &populated);
    return -EINVAL;
  }
  *output = vector;
  return 0;
}

static int copy_current_environment(dolly_kernel_process *process) {
  uint32_t count = 0;
  while (environ != NULL && environ[count] != NULL) {
    if (count == UINT32_MAX) return -E2BIG;
    ++count;
  }
  process->environment = calloc((size_t)count + 1,
                                sizeof(*process->environment));
  if (process->environment == NULL) return -ENOMEM;
  for (uint32_t index = 0; index < count; ++index) {
    process->environment[index] = strdup(environ[index]);
    if (process->environment[index] == NULL) {
      process->environment_count = index;
      return -ENOMEM;
    }
  }
  process->environment_count = count;
  return 0;
}

static int copy_descriptor(dolly_kernel_process *process,
                            const dolly_kernel_process *parent,
                            uint32_t source, uint32_t target) {
  if (source > INT_MAX || target >= DOLLY_KERNEL_DESCRIPTOR_LIMIT ||
      (parent != NULL && !descriptor_is_open(parent, source))) return -EBADF;
  if (parent != NULL && parent->pipes[source] != NULL) {
    dolly_kernel_pipe *pipe = parent->pipes[source];
    const unsigned direction = parent->pipe_directions[source];
    retain_pipe(pipe, direction);
    release_descriptor(process, target);
    process->pipes[target] = pipe;
    process->pipe_directions[target] = (unsigned char)direction;
  } else {
    const int kernel_fd = parent != NULL ? parent->descriptors[source] : (int)source;
    const int duplicate = dup(kernel_fd);
    if (duplicate < 0) return -errno;
    release_descriptor(process, target);
    process->descriptors[target] = duplicate;
    process->terminal_descriptors[target] = parent != NULL
        ? parent->terminal_descriptors[source]
        : (source <= STDERR_FILENO);
  }
  return 0;
}

/* WasmFS's /dev/stdin, /dev/stdout and /dev/stderr name the opening process's
 * own descriptors 0-2, never the kernel's bootstrap streams. Identity rather
 * than path comparison also covers links and relative paths. */
static int standard_stream(int kernel_fd) {
  static const char *const paths[] = {"/dev/stdin", "/dev/stdout", "/dev/stderr"};
  struct stat opened, standard;
  if (fstat(kernel_fd, &opened) != 0 || !S_ISCHR(opened.st_mode)) return -1;
  for (int stream = 0; stream < 3; ++stream) {
    if (stat(paths[stream], &standard) == 0 && standard.st_dev == opened.st_dev &&
        standard.st_ino == opened.st_ino) return stream;
  }
  return -1;
}

/* /dev/tty names the one terminal every Dolly process shares; there are no
 * sessions, so it is every process's controlling terminal. */
static int controlling_terminal(int kernel_fd) {
  struct stat opened, terminal;
  return fstat(kernel_fd, &opened) == 0 && stat("/dev/tty", &terminal) == 0 &&
      terminal.st_dev == opened.st_dev &&
      terminal.st_ino == opened.st_ino;
}

static int configure_descriptors(dolly_kernel_process *process,
                                 const dolly_kernel_process *parent,
                                 const dolly_process_spawn_request *request,
                                 const unsigned char *mapping_bytes) {
  unsigned char mapped[DOLLY_KERNEL_DESCRIPTOR_LIMIT] = {0};
  const uint32_t limit = request->descriptor_inheritance == DOLLY_PROCESS_INHERIT_FDS_ALL
      ? DOLLY_KERNEL_DESCRIPTOR_LIMIT
      : request->descriptor_inheritance == DOLLY_PROCESS_INHERIT_FDS_STDIO ? 3 : 0;
  if (limit != 0 && parent == NULL) return -EINVAL;
  for (uint32_t index = 0; index < request->mapping_count; ++index) {
    dolly_process_fd_mapping mapping;
    memcpy(&mapping, mapping_bytes + index * sizeof(mapping), sizeof(mapping));
    if (mapping.target_descriptor >= DOLLY_KERNEL_DESCRIPTOR_LIMIT ||
        mapping.source_descriptor > INT_MAX) return -EBADF;
    if (mapped[mapping.target_descriptor]) return -EINVAL;
    mapped[mapping.target_descriptor] = 1;
    if (parent != NULL) {
      if (!descriptor_is_open(parent, mapping.source_descriptor)) return -EBADF;
    } else {
      struct stat metadata;
      if (fstat((int)mapping.source_descriptor, &metadata) != 0) return -errno;
    }
  }
  for (uint32_t index = 0; index < request->mapping_count; ++index) {
    dolly_process_fd_mapping mapping;
    memcpy(&mapping, mapping_bytes + index * sizeof(mapping), sizeof(mapping));
    const int result = copy_descriptor(process, parent,
        mapping.source_descriptor, mapping.target_descriptor);
    if (result != 0) return result;
  }
  for (uint32_t descriptor = 0; descriptor < limit; ++descriptor) {
    if (mapped[descriptor] || !descriptor_is_open(parent, descriptor) ||
        (parent->descriptor_flags[descriptor] & DOLLY_PROCESS_FD_CLOEXEC)) continue;
    const int result = copy_descriptor(process, parent, descriptor, descriptor);
    if (result != 0) return result;
  }
  return 0;
}

/* A spawn deadline is absent (UINT64_MAX) or at most one day away. */
static int valid_spawn_deadline(uint64_t deadline) {
  const uint64_t now = clock_nanoseconds(CLOCK_MONOTONIC);
  return deadline == UINT64_MAX || deadline <= now ||
      deadline - now <= DOLLY_KERNEL_SPAWN_DEADLINE_LIMIT;
}

static int spawn_packet(int parent_pid, size_t size) {
  if (size < sizeof(dolly_process_spawn_request) ||
      size > sizeof(process_mailbox)) return -EINVAL;
  dolly_process_spawn_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.cwd_size > PATH_MAX || request.argument_count == 0 ||
      request.path_size == 0 || request.path_size > PATH_MAX ||
      request.reserved != 0 ||
      request.descriptor_inheritance > DOLLY_PROCESS_INHERIT_FDS_ALL ||
      request.mapping_count > DOLLY_KERNEL_DESCRIPTOR_LIMIT ||
      (request.flags & ~(DOLLY_PROCESS_SPAWN_INHERIT_ENVIRONMENT |
                        DOLLY_PROCESS_SPAWN_FOREGROUND |
                        DOLLY_PROCESS_SPAWN_INTERACTIVE)) != 0 ||
      ((request.flags & DOLLY_PROCESS_SPAWN_INTERACTIVE) != 0 &&
       (request.flags & DOLLY_PROCESS_SPAWN_FOREGROUND) == 0) ||
      request.argument_bytes > SIZE_MAX || request.environment_bytes > SIZE_MAX ||
      !valid_spawn_deadline(request.deadline_nanoseconds)) {
    return -EINVAL;
  }
  const size_t path_size = request.path_size;
  const size_t argument_bytes = (size_t)request.argument_bytes;
  const size_t environment_bytes = (size_t)request.environment_bytes;
  const size_t mapping_bytes = request.mapping_count * sizeof(dolly_process_fd_mapping);
  if (path_size > size - sizeof(request) ||
      argument_bytes > size - sizeof(request) - path_size ||
      environment_bytes > size - sizeof(request) - path_size - argument_bytes ||
      request.cwd_size > size - sizeof(request) - path_size - argument_bytes - environment_bytes ||
      mapping_bytes != size - sizeof(request) - path_size - argument_bytes - environment_bytes - request.cwd_size) {
    return -EINVAL;
  }
  const unsigned char *cursor = process_mailbox + sizeof(request);
  if (memchr(cursor, 0, path_size) != NULL || cursor[0] != '/') return -EINVAL;
  if ((request.flags & DOLLY_PROCESS_SPAWN_FOREGROUND) != 0 &&
      foreground_pid != 0 &&
      !dolly_process_descends_from(parent_pid, foreground_pid)) return -EBUSY;

  dolly_kernel_process *process = allocate_process();
  if (process == NULL) return -EAGAIN;
  process->parent_pid = parent_pid;
  process->spawn_flags = request.flags;
  process->deadline_nanoseconds = request.deadline_nanoseconds;
  dolly_kernel_process *parent = parent_pid == 0 ? NULL : find_process(parent_pid);
  int result = 0;
  if (parent_pid != 0 && parent == NULL) result = -ESRCH;
  if (result == 0) {
    if (request.cwd_size != 0) {
      const unsigned char *cwd = process_mailbox + size - mapping_bytes - request.cwd_size;
      char directory[PATH_MAX + 1];
      if (cwd[0] != '/' || memchr(cwd, 0, request.cwd_size) != NULL) result = -EINVAL;
      else {
        memcpy(directory, cwd, request.cwd_size);
        directory[request.cwd_size] = 0;
        process->current_directory = open(directory, O_RDONLY | O_DIRECTORY);
      }
    } else if (parent != NULL) {
      process->current_directory = dup(parent->current_directory);
    } else {
      process->current_directory = open(".", O_RDONLY | O_DIRECTORY);
    }
    if (result == 0 && process->current_directory < 0) result = -errno;
  }
  process->path = malloc(path_size + 1);
  if (process->path == NULL && result == 0) result = -ENOMEM;
  if (result == 0) {
    memcpy(process->path, cursor, path_size);
    process->path[path_size] = 0;
    cursor += path_size;
    result = copy_string_vector(cursor, argument_bytes,
                                request.argument_count, &process->arguments);
    if (result == 0) process->argument_count = request.argument_count;
    cursor += argument_bytes;
  }
  if (result == 0 &&
      (request.flags & DOLLY_PROCESS_SPAWN_INHERIT_ENVIRONMENT) != 0) {
    if (request.environment_count != 0 || environment_bytes != 0) {
      result = -EINVAL;
    } else if (parent_pid == 0) {
      result = copy_current_environment(process);
    } else {
      if (parent == NULL) result = -ESRCH;
      else {
        for (uint32_t index = 0; index < parent->environment_count; ++index) {
          const size_t length = strlen(parent->environment[index]) + 1;
          if (length > SIZE_MAX - environment_bytes) {
            result = -E2BIG;
            break;
          }
        }
        if (result == 0) {
          process->environment = calloc((size_t)parent->environment_count + 1,
                                        sizeof(*process->environment));
          if (process->environment == NULL) result = -ENOMEM;
        }
        for (uint32_t index = 0;
             result == 0 && index < parent->environment_count; ++index) {
          process->environment[index] = strdup(parent->environment[index]);
          if (process->environment[index] == NULL) result = -ENOMEM;
          else process->environment_count++;
        }
      }
    }
  } else if (result == 0) {
    result = copy_string_vector(cursor, environment_bytes,
                                request.environment_count,
                                &process->environment);
    if (result == 0) process->environment_count = request.environment_count;
  }
  if (result == 0) result = configure_descriptors(
      process, parent, &request, process_mailbox + size - mapping_bytes);
  if (result == 0) result = read_image(process);
  if (result != 0) {
    dispose_process(process);
    return result;
  }
  if ((request.flags & DOLLY_PROCESS_SPAWN_FOREGROUND) != 0) {
    foreground_pid = process->pid;
  }
  refresh_foreground();
  return process->pid;
}

static int64_t respond(const void *response, size_t size) {
  memcpy(process_mailbox, response, size);
  return (int64_t)size;
}

static int64_t vector_sizes(char **vector, uint32_t count,
                            uintptr_t response_capacity) {
  if (response_capacity < sizeof(dolly_process_vector_sizes)) return -ENOBUFS;
  uint64_t bytes = 0;
  for (uint32_t index = 0; index < count; ++index) {
    size_t length = strlen(vector[index]) + 1;
    if (bytes > UINT64_MAX - length) return -EOVERFLOW;
    bytes += length;
  }
  dolly_process_vector_sizes response = {count, 0, bytes};
  return respond(&response, sizeof(response));
}

static int64_t vector_bytes(char **vector, uint32_t count,
                            uintptr_t response_capacity) {
  size_t offset = 0;
  for (uint32_t index = 0; index < count; ++index) {
    const size_t length = strlen(vector[index]) + 1;
    if (length > response_capacity - offset) return -ENOBUFS;
    memcpy(process_mailbox + offset, vector[index], length);
    offset += length;
  }
  return (int64_t)offset;
}

static int descriptor_for(dolly_kernel_process *process, uint32_t descriptor) {
  if (!descriptor_is_open(process, descriptor)) return -EBADF;
  if (process->pipes[descriptor] != NULL) return -ESPIPE;
  return process->descriptors[descriptor];
}

/* Decodes a dolly_process_fd_request that names an open descriptor. */
static int decode_fd_request(const dolly_kernel_process *process,
                             uintptr_t request_size, uint32_t *descriptor) {
  dolly_process_fd_request request;
  if (request_size != sizeof(request)) return -EINVAL;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.reserved != 0) return -EINVAL;
  if (!descriptor_is_open(process, request.descriptor)) return -EBADF;
  *descriptor = request.descriptor;
  return 0;
}

static int unused_descriptor(const dolly_kernel_process *process, uint32_t minimum) {
  for (uint32_t descriptor = minimum;
       descriptor < DOLLY_KERNEL_DESCRIPTOR_LIMIT; ++descriptor) {
    if (!descriptor_is_open(process, descriptor)) return (int)descriptor;
  }
  return -EMFILE;
}

static int allocate_pipe_descriptor(dolly_kernel_process *process,
                                    dolly_kernel_pipe *pipe,
                                    unsigned direction) {
  const int descriptor = unused_descriptor(process, 0);
  if (descriptor >= 0) {
    process->pipes[descriptor] = pipe;
    process->pipe_directions[descriptor] = (unsigned char)direction;
    process->descriptor_flags[descriptor] = 0;
    retain_pipe(pipe, direction);
  }
  return descriptor;
}

static int path_from_packet(dolly_kernel_process *process,
                            uint32_t directory_descriptor,
                            const unsigned char *bytes, uint32_t size,
                            char **path_out, int *directory_out) {
  if (size == 0 || size > PATH_MAX || memchr(bytes, 0, size) != NULL) {
    return -EINVAL;
  }
  int directory = AT_FDCWD;
  if (bytes[0] != '/') {
    directory = directory_descriptor == UINT32_MAX
        ? process->current_directory : descriptor_for(process, directory_descriptor);
    if (directory < 0) return directory;
  }
  char *path = malloc((size_t)size + 1);
  if (path == NULL) return -ENOMEM;
  memcpy(path, bytes, size);
  path[size] = 0;
  *path_out = path;
  *directory_out = directory;
  return 0;
}

static int directory_path(int descriptor, char *buffer, size_t capacity) {
  const int saved = open(".", O_RDONLY | O_DIRECTORY);
  if (saved < 0) return -errno;
  // Kernel dispatch is serial; restore its cwd before returning to the broker.
  int result = fchdir(descriptor) == 0 ? 0 : -errno;
  if (result == 0 && getcwd(buffer, capacity) == NULL) result = -errno;
  if (fchdir(saved) != 0) result = -errno;
  close(saved);
  return result;
}

static int decode_path_request(dolly_kernel_process *process,
                               uintptr_t request_size, uint32_t allowed_flags,
                               dolly_process_path_request *request,
                               char **path, int *directory) {
  if (request_size < sizeof(*request)) return -EINVAL;
  memcpy(request, process_mailbox, sizeof(*request));
  if (request->reserved != 0 ||
      request->path_size != request_size - sizeof(*request)) return -EINVAL;
  int result = path_from_packet(process, request->directory_descriptor,
                                process_mailbox + sizeof(*request),
                                request->path_size, path, directory);
  if (result == 0 && (request->flags & ~allowed_flags) != 0) {
    free(*path);
    *path = NULL;
    result = -EINVAL;
  }
  return result;
}

static int decode_two_path_request(uintptr_t request_size,
                                   dolly_process_two_path_request *request) {
  if (request_size < sizeof(*request)) return -EINVAL;
  memcpy(request, process_mailbox, sizeof(*request));
  const uintptr_t paths_size = request_size - sizeof(*request);
  if (request->old_path_size == 0 || request->new_path_size == 0 ||
      request->old_path_size > paths_size ||
      request->new_path_size != paths_size - request->old_path_size) return -EINVAL;
  return 0;
}

int64_t dolly_kernel_request_path(int pid, uintptr_t request_size,
                                  char *path, size_t capacity) {
  dolly_kernel_process *process = find_process(pid);
  if (process == NULL) return -ESRCH;
  dolly_process_path_request request;
  char *requested = NULL;
  int directory = AT_FDCWD;
  int result = decode_path_request(process, request_size, 0, &request,
                                   &requested, &directory);
  if (result == 0 && directory == AT_FDCWD) {
    if (strlen(requested) >= capacity) result = -ENAMETOOLONG;
    else strcpy(path, requested);
  } else if (result == 0) {
    result = directory_path(directory, path, capacity);
    const size_t prefix = result == 0 ? strlen(path) : 0, length = strlen(requested);
    if (result == 0 && prefix + 1 + length >= capacity) result = -ENAMETOOLONG;
    else if (result == 0) {
      path[prefix] = '/';
      memcpy(path + prefix + 1, requested, length + 1);
    }
  }
  free(requested);
  return result;
}

static uint32_t stable_file_type(mode_t mode) {
  if (S_ISREG(mode)) return DOLLY_PROCESS_FILE_REGULAR;
  if (S_ISDIR(mode)) return DOLLY_PROCESS_FILE_DIRECTORY;
  if (S_ISLNK(mode)) return DOLLY_PROCESS_FILE_SYMBOLIC_LINK;
  if (S_ISCHR(mode)) return DOLLY_PROCESS_FILE_CHARACTER_DEVICE;
  if (S_ISBLK(mode)) return DOLLY_PROCESS_FILE_BLOCK_DEVICE;
  if (S_ISFIFO(mode)) return DOLLY_PROCESS_FILE_FIFO;
  if (S_ISSOCK(mode)) return DOLLY_PROCESS_FILE_SOCKET;
  return DOLLY_PROCESS_FILE_UNKNOWN;
}

static void encode_stat(const struct stat *metadata,
                        dolly_process_stat_response *response) {
  memset(response, 0, sizeof(*response));
  response->device = metadata->st_dev;
  response->inode = metadata->st_ino;
  response->size = metadata->st_size;
  response->access_nanoseconds =
      (uint64_t)metadata->st_atim.tv_sec * 1000000000u + metadata->st_atim.tv_nsec;
  response->modification_nanoseconds =
      (uint64_t)metadata->st_mtim.tv_sec * 1000000000u + metadata->st_mtim.tv_nsec;
  response->change_nanoseconds =
      (uint64_t)metadata->st_ctim.tv_sec * 1000000000u + metadata->st_ctim.tv_nsec;
  response->blocks = metadata->st_blocks;
  response->mode = metadata->st_mode & 07777;
  response->link_count = metadata->st_nlink;
  response->user = metadata->st_uid;
  response->group = metadata->st_gid;
  response->block_size = metadata->st_blksize;
  response->file_type = stable_file_type(metadata->st_mode);
}

/* Files live in kernel memory: its maximum is the capacity, and memory below
 * the break that malloc has not handed out, or above it, is free. Like btrfs,
 * report the absent inode limit as zero files. */
static void encode_filesystem_stat(dolly_process_filesystem_stat_response *response) {
  const uint64_t block = 4096, capacity = DOLLY_KERNEL_MEMORY_MAXIMUM;
  const uint64_t used = (uintptr_t)sbrk(0) - mallinfo().fordblks;
  memset(response, 0, sizeof(*response));
  response->block_size = block;
  response->fragment_size = block;
  response->blocks = capacity / block;
  response->blocks_free = used < capacity ? (capacity - used) / block : 0;
  response->blocks_available = response->blocks_free;
  response->maximum_name_length = 255;
#ifdef ST_NOSUID
  response->flags = ST_NOSUID;
#endif
}

static int decode_timestamp(const dolly_process_timestamp *source,
                            struct timespec *target) {
  if ((source->flags & ~(DOLLY_PROCESS_TIME_NOW |
                         DOLLY_PROCESS_TIME_OMIT)) != 0 ||
      source->flags == (DOLLY_PROCESS_TIME_NOW | DOLLY_PROCESS_TIME_OMIT)) {
    return -EINVAL;
  }
  if ((source->flags & DOLLY_PROCESS_TIME_NOW) != 0) {
    target->tv_sec = 0;
    target->tv_nsec = UTIME_NOW;
  } else if ((source->flags & DOLLY_PROCESS_TIME_OMIT) != 0) {
    target->tv_sec = 0;
    target->tv_nsec = UTIME_OMIT;
  } else {
    if (source->nanoseconds >= 1000000000u) return -EINVAL;
    target->tv_sec = source->seconds;
    target->tv_nsec = source->nanoseconds;
  }
  return 0;
}

static int decode_timestamps(const dolly_process_timestamp *access,
                             const dolly_process_timestamp *modification,
                             struct timespec times[2]) {
  int result = decode_timestamp(access, &times[0]);
  return result == 0 ? decode_timestamp(modification, &times[1]) : result;
}

static int open_flags(uint32_t flags) {
  const uint32_t known = DOLLY_PROCESS_OPEN_READ | DOLLY_PROCESS_OPEN_WRITE |
      DOLLY_PROCESS_OPEN_CREATE | DOLLY_PROCESS_OPEN_EXCLUSIVE |
      DOLLY_PROCESS_OPEN_TRUNCATE | DOLLY_PROCESS_OPEN_APPEND |
      DOLLY_PROCESS_OPEN_DIRECTORY | DOLLY_PROCESS_OPEN_NOFOLLOW |
      DOLLY_PROCESS_OPEN_CLOEXEC;
  if ((flags & ~known) != 0 ||
      (flags & (DOLLY_PROCESS_OPEN_READ | DOLLY_PROCESS_OPEN_WRITE)) == 0) {
    return -EINVAL;
  }
  int result = (flags & DOLLY_PROCESS_OPEN_READ) != 0
      ? ((flags & DOLLY_PROCESS_OPEN_WRITE) != 0 ? O_RDWR : O_RDONLY)
      : O_WRONLY;
  if ((flags & DOLLY_PROCESS_OPEN_CREATE) != 0) result |= O_CREAT;
  if ((flags & DOLLY_PROCESS_OPEN_EXCLUSIVE) != 0) result |= O_EXCL;
  if ((flags & DOLLY_PROCESS_OPEN_TRUNCATE) != 0) result |= O_TRUNC;
  if ((flags & DOLLY_PROCESS_OPEN_APPEND) != 0) result |= O_APPEND;
#ifdef O_DIRECTORY
  if ((flags & DOLLY_PROCESS_OPEN_DIRECTORY) != 0) result |= O_DIRECTORY;
#endif
#ifdef O_NOFOLLOW
  if ((flags & DOLLY_PROCESS_OPEN_NOFOLLOW) != 0) result |= O_NOFOLLOW;
#endif
  return result;
}

static int64_t fd_read_packet(dolly_kernel_process *process,
                              uintptr_t request_size,
                              uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_fd_io_request)) return -EINVAL;
  dolly_process_fd_io_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.reserved != 0 || request.size > response_capacity) return -EINVAL;
  if (request.descriptor >= DOLLY_KERNEL_DESCRIPTOR_LIMIT) return -EBADF;
  dolly_kernel_pipe *pipe = process->pipes[request.descriptor];
  if (pipe != NULL) {
    if (process->pipe_directions[request.descriptor] != DOLLY_KERNEL_PIPE_READ) {
      return -EBADF;
    }
    if (request.size == 0) return 0;
    if (pipe->size == 0) {
      return pipe->writers == 0 ? 0 : pipe->nonblocking[0] ? -EAGAIN :
          DOLLY_PROCESS_DISPATCH_DEFERRED;
    }
    size_t count = (size_t)request.size;
    if (count > pipe->size) count = pipe->size;
    size_t first = DOLLY_KERNEL_PIPE_CAPACITY - pipe->offset;
    if (first > count) first = count;
    memcpy(process_mailbox, pipe->bytes + pipe->offset, first);
    memcpy(process_mailbox + first, pipe->bytes, count - first);
    pipe->offset = (pipe->offset + count) % DOLLY_KERNEL_PIPE_CAPACITY;
    pipe->size -= count;
    return (int64_t)count;
  }
  int descriptor = descriptor_for(process, request.descriptor);
  if (descriptor < 0) return descriptor;
  if (process->terminal_descriptors[request.descriptor]) {
    if (request.size == 0) return 0;
    const int byte = dolly_kernel_terminal_read();
    if (byte < 0) {
      const int flags = fcntl(descriptor, F_GETFL);
      if (flags < 0) return -errno;
      return flags & O_NONBLOCK ? -EAGAIN : DOLLY_PROCESS_DISPATCH_DEFERRED;
    }
    process_mailbox[0] = (unsigned char)byte;
    size_t count = 1;
    while (count < request.size) {
      const int next = dolly_kernel_terminal_read();
      if (next < 0) break;
      process_mailbox[count++] = (unsigned char)next;
    }
    return (int64_t)count;
  }
  for (;;) {
    ssize_t count = read(descriptor, process_mailbox, (size_t)request.size);
    if (count < 0 && errno == EINTR) continue;
    if (count < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
      return DOLLY_PROCESS_DISPATCH_DEFERRED;
    }
    return count < 0 ? -errno : count;
  }
}

static int64_t fd_pread_packet(dolly_kernel_process *process,
                               uintptr_t request_size,
                               uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_fd_pread_request)) return -EINVAL;
  dolly_process_fd_pread_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.reserved != 0 || request.size > response_capacity ||
      request.offset > INT64_MAX) return -EINVAL;
  int descriptor = descriptor_for(process, request.descriptor);
  if (descriptor < 0) return descriptor;
  for (;;) {
    const ssize_t count = pread(descriptor, process_mailbox,
                                (size_t)request.size, (off_t)request.offset);
    if (count < 0 && errno == EINTR) continue;
    return count < 0 ? -errno : count;
  }
}

static int64_t fd_pwrite_packet(dolly_kernel_process *process,
                                uintptr_t request_size,
                                uintptr_t response_capacity) {
  if (request_size < sizeof(dolly_process_fd_pread_request) ||
      response_capacity < sizeof(dolly_process_io_result)) return -EINVAL;
  dolly_process_fd_pread_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.reserved != 0 ||
      request.size != request_size - sizeof(request) ||
      request.offset > INT64_MAX) return -EINVAL;
  int descriptor = descriptor_for(process, request.descriptor);
  if (descriptor < 0) return descriptor;
  const ssize_t count = pwrite(
      descriptor, process_mailbox + sizeof(request),
      (size_t)request.size, (off_t)request.offset);
  if (count < 0) return -errno;
  const dolly_process_io_result response = {(uint64_t)count};
  return respond(&response, sizeof(response));
}

static int64_t fd_read_directory_packet(dolly_kernel_process *process,
                                        uintptr_t request_size,
                                        uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_directory_request)) return -EINVAL;
  dolly_process_directory_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.reserved != 0 || request.maximum_entries == 0) return -EINVAL;
  int descriptor = descriptor_for(process, request.descriptor);
  if (descriptor < 0) return descriptor;
  DIR *directory = process->directories[request.descriptor];
  if (directory == NULL) {
    int duplicate = dup(descriptor);
    if (duplicate < 0) return -errno;
    directory = fdopendir(duplicate);
    if (directory == NULL) {
      const int error = errno;
      close(duplicate);
      return -error;
    }
    process->directories[request.descriptor] = directory;
  }
  if (request.cookie == 0) rewinddir(directory);
  else if (request.cookie != UINT64_MAX) seekdir(directory, (long)request.cookie);

  size_t offset = 0;
  uint32_t entries = 0;
  while (entries < request.maximum_entries) {
    const long before = telldir(directory);
    errno = 0;
    struct dirent *entry = readdir(directory);
    if (entry == NULL) return errno == 0 ? (int64_t)offset : -errno;
    const size_t name_size = strlen(entry->d_name);
    const size_t record_size = sizeof(dolly_process_directory_entry) + name_size;
    if (record_size > response_capacity - offset) {
      if (before >= 0) seekdir(directory, before);
      return offset == 0 ? -ENOBUFS : (int64_t)offset;
    }
    const long after = telldir(directory);
    uint32_t type = DOLLY_PROCESS_FILE_UNKNOWN;
    switch (entry->d_type) {
      case DT_REG: type = DOLLY_PROCESS_FILE_REGULAR; break;
      case DT_DIR: type = DOLLY_PROCESS_FILE_DIRECTORY; break;
      case DT_LNK: type = DOLLY_PROCESS_FILE_SYMBOLIC_LINK; break;
      case DT_CHR: type = DOLLY_PROCESS_FILE_CHARACTER_DEVICE; break;
      case DT_BLK: type = DOLLY_PROCESS_FILE_BLOCK_DEVICE; break;
      case DT_FIFO: type = DOLLY_PROCESS_FILE_FIFO; break;
      case DT_SOCK: type = DOLLY_PROCESS_FILE_SOCKET; break;
      default: break;
    }
    const dolly_process_directory_entry encoded = {
        entry->d_ino,
        after < 0 ? UINT64_MAX : (uint64_t)after,
        type,
        (uint32_t)name_size,
    };
    memcpy(process_mailbox + offset, &encoded, sizeof(encoded));
    memcpy(process_mailbox + offset + sizeof(encoded), entry->d_name, name_size);
    offset += record_size;
    ++entries;
  }
  return (int64_t)offset;
}

static int64_t fd_write_packet(dolly_kernel_process *process,
                               uintptr_t request_size,
                               uintptr_t response_capacity) {
  if (request_size < sizeof(dolly_process_fd_io_request) ||
      response_capacity < sizeof(dolly_process_io_result)) return -EINVAL;
  dolly_process_fd_io_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.reserved != 0 || request.size != request_size - sizeof(request)) return -EINVAL;
  if (request.descriptor >= DOLLY_KERNEL_DESCRIPTOR_LIMIT) return -EBADF;
  dolly_kernel_pipe *pipe = process->pipes[request.descriptor];
  if (pipe != NULL) {
    if (process->pipe_directions[request.descriptor] != DOLLY_KERNEL_PIPE_WRITE) {
      return -EBADF;
    }
    if (request.size == 0) {
      const dolly_process_io_result response = {0};
      return respond(&response, sizeof(response));
    }
    if (pipe->readers == 0) return -EPIPE;
    const size_t available = DOLLY_KERNEL_PIPE_CAPACITY - pipe->size;
    if (available == 0 || (request.size <= PIPE_BUF && available < request.size))
      return pipe->nonblocking[1] ? -EAGAIN : DOLLY_PROCESS_DISPATCH_DEFERRED;
    size_t completed = (size_t)request.size;
    if (completed > available) completed = available;
    const size_t tail = (pipe->offset + pipe->size) % DOLLY_KERNEL_PIPE_CAPACITY;
    size_t first = DOLLY_KERNEL_PIPE_CAPACITY - tail;
    if (first > completed) first = completed;
    memcpy(pipe->bytes + tail, process_mailbox + sizeof(request), first);
    memcpy(pipe->bytes, process_mailbox + sizeof(request) + first,
           completed - first);
    pipe->size += completed;
    const dolly_process_io_result response = {completed};
    return respond(&response, sizeof(response));
  }
  const int descriptor = descriptor_for(process, request.descriptor);
  if (descriptor < 0) return descriptor;
  const unsigned char *bytes = process_mailbox + sizeof(request);
  size_t completed = 0;
  while (completed < request.size) {
    ssize_t count = write(descriptor, bytes + completed,
                          (size_t)request.size - completed);
    if (count < 0 && errno == EINTR) continue;
    if (count < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
      if (completed == 0) return DOLLY_PROCESS_DISPATCH_DEFERRED;
      break;
    }
    if (count < 0) return -errno;
    if (count == 0) break;
    completed += (size_t)count;
  }
  dolly_process_io_result response = {completed};
  return respond(&response, sizeof(response));
}

static double deferred_milliseconds = -1;

static int64_t terminal_packet(dolly_kernel_process *process,
                               uintptr_t request_size,
                               uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_terminal_request) ||
      response_capacity < sizeof(dolly_process_terminal_response)) return -EINVAL;
  dolly_process_terminal_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.reserved != 0) return -EINVAL;
  dolly_process_terminal_response response = {0};
  if (request.operation == DOLLY_PROCESS_TERMINAL_PUBLISH_RESULT) {
    dolly_terminal_publish_result((int)request.flags);
    return respond(&response, sizeof(response));
  }
  if (request.operation != DOLLY_PROCESS_TERMINAL_READ &&
      request.operation != DOLLY_PROCESS_TERMINAL_ISATTY &&
      request.operation != DOLLY_PROCESS_TERMINAL_MODE_GET &&
      request.operation != DOLLY_PROCESS_TERMINAL_MODE_SET &&
      request.operation != DOLLY_PROCESS_TERMINAL_SIZE) return -EINVAL;
  const int descriptor = descriptor_for(process, request.descriptor);
  if (descriptor < 0) return descriptor;
  const int terminal = process->terminal_descriptors[request.descriptor] != 0;
  if (request.operation == DOLLY_PROCESS_TERMINAL_ISATTY) {
    response.value = terminal;
  } else if (!terminal) {
    return -ENOTTY;
  } else if (request.operation == DOLLY_PROCESS_TERMINAL_READ) {
    const int byte = dolly_kernel_terminal_read();
    if (byte < 0 && dolly_kernel_deadline_pending(request.deadline_nanoseconds)) {
      return DOLLY_PROCESS_DISPATCH_DEFERRED;
    }
    response.value = byte;
  } else if (request.operation == DOLLY_PROCESS_TERMINAL_MODE_GET) {
    response.value = dolly_kernel_terminal_mode();
  } else if (request.operation == DOLLY_PROCESS_TERMINAL_MODE_SET) {
    const int result = dolly_kernel_terminal_set_mode(request.flags);
    if (result < 0) return result;
    refresh_foreground();
  } else {
    response.columns = dolly_terminal_columns();
    response.rows = dolly_terminal_rows();
  }
  return respond(&response, sizeof(response));
}

int dolly_kernel_deadline_pending(uint64_t deadline_nanoseconds) {
  if (deadline_nanoseconds == 0) return 0;
  if (deadline_nanoseconds == UINT64_MAX) return 1;
  const uint64_t current = clock_nanoseconds(CLOCK_MONOTONIC);
  if (current < deadline_nanoseconds) {
    deferred_milliseconds = (double)(deadline_nanoseconds - current) / 1000000.0;
  }
  return current < deadline_nanoseconds;
}

static uint16_t fd_poll_events(dolly_kernel_process *process,
                               const dolly_process_poll_query *query) {
  const uint16_t requested = query->events;
  if (query->descriptor == DOLLY_PROCESS_POLL_IGNORED_DESCRIPTOR) return 0;
  if (!descriptor_is_open(process, query->descriptor)) {
    return DOLLY_PROCESS_POLL_INVALID;
  }

  dolly_kernel_pipe *pipe = process->pipes[query->descriptor];
  if (pipe != NULL) {
    const unsigned direction = process->pipe_directions[query->descriptor];
    uint16_t result = 0;
    if (direction == DOLLY_KERNEL_PIPE_READ) {
      if ((requested & DOLLY_PROCESS_POLL_READ) != 0 && pipe->size != 0) {
        result |= DOLLY_PROCESS_POLL_READ;
      }
      if (pipe->writers == 0) result |= DOLLY_PROCESS_POLL_HANGUP;
    } else if (direction == DOLLY_KERNEL_PIPE_WRITE) {
      if (pipe->readers == 0) {
        result |= DOLLY_PROCESS_POLL_ERROR | DOLLY_PROCESS_POLL_HANGUP;
      } else if ((requested & DOLLY_PROCESS_POLL_WRITE) != 0 &&
                 pipe->size < DOLLY_KERNEL_PIPE_CAPACITY) {
        result |= DOLLY_PROCESS_POLL_WRITE;
      }
    } else {
      result |= DOLLY_PROCESS_POLL_INVALID;
    }
    return result;
  }

  const int descriptor = descriptor_for(process, query->descriptor);
  if (descriptor < 0) return DOLLY_PROCESS_POLL_INVALID;
  int access = fcntl(descriptor, F_GETFL);
  if (access < 0) return DOLLY_PROCESS_POLL_ERROR;
  access &= O_ACCMODE;

  uint16_t result = 0;
  if (process->terminal_descriptors[query->descriptor]) {
    if ((requested & DOLLY_PROCESS_POLL_READ) != 0 && access != O_WRONLY &&
        dolly_kernel_terminal_ready()) {
      result |= DOLLY_PROCESS_POLL_READ;
    }
    if ((requested & DOLLY_PROCESS_POLL_WRITE) != 0 && access != O_RDONLY) {
      result |= DOLLY_PROCESS_POLL_WRITE;
    }
    return result;
  }

  /* Kernel-backed regular files and directories never need host readiness.
   * Their next bounded read or write can complete synchronously. */
  if ((requested & DOLLY_PROCESS_POLL_READ) != 0 && access != O_WRONLY) {
    result |= DOLLY_PROCESS_POLL_READ;
  }
  if ((requested & DOLLY_PROCESS_POLL_WRITE) != 0 && access != O_RDONLY) {
    result |= DOLLY_PROCESS_POLL_WRITE;
  }
  return result;
}

static int64_t fd_poll_packet(dolly_kernel_process *process,
                              uintptr_t request_size,
                              uintptr_t response_capacity) {
  if (request_size < sizeof(dolly_process_poll_request)) return -EINVAL;
  dolly_process_poll_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.reserved != 0 ||
      request.count > (sizeof(process_mailbox) - sizeof(request)) /
          sizeof(dolly_process_poll_query)) {
    return -EINVAL;
  }
  const size_t queries_size =
      (size_t)request.count * sizeof(dolly_process_poll_query);
  const size_t expected_request = sizeof(request) + queries_size;
  const size_t expected_response = sizeof(dolly_process_poll_response) +
      (size_t)request.count * sizeof(dolly_process_poll_result);
  if (request_size != expected_request || response_capacity < expected_response) {
    return -EINVAL;
  }

  /* Request and response headers and records have equal sizes, so each
   * result overwrites its own query in place. The header is written last. */
  uint32_t ready = 0;
  const uint16_t known = DOLLY_PROCESS_POLL_READ |
      DOLLY_PROCESS_POLL_WRITE | DOLLY_PROCESS_POLL_PRIORITY;
  for (uint32_t index = 0; index < request.count; ++index) {
    dolly_process_poll_query query;
    memcpy(&query, process_mailbox + sizeof(request) +
                       (size_t)index * sizeof(query), sizeof(query));
    if (query.reserved != 0 || (query.events & ~known) != 0) return -EINVAL;
    const uint16_t events = fd_poll_events(process, &query);
    if (events != 0) ++ready;
    dolly_process_poll_result result = {events, 0, 0};
    memcpy(process_mailbox + sizeof(dolly_process_poll_response) +
               (size_t)index * sizeof(result), &result, sizeof(result));
  }
  if (ready == 0 && dolly_kernel_deadline_pending(request.deadline_nanoseconds)) {
    return DOLLY_PROCESS_DISPATCH_DEFERRED;
  }
  const dolly_process_poll_response response = {
      .ready = ready,
      .count = request.count,
      .reserved = 0,
  };
  memcpy(process_mailbox, &response, sizeof(response));
  return (int64_t)expected_response;
}

uint32_t dolly_process_supervisor_version(void) { return 0; }

uintptr_t dolly_process_mailbox_address(void) {
  return (uintptr_t)process_mailbox;
}

uintptr_t dolly_process_mailbox_capacity(void) {
  return sizeof(process_mailbox);
}

double dolly_process_deferred_milliseconds(void) {
  return deferred_milliseconds;
}

int dolly_process_spawn_serialized(uintptr_t request_size) {
  return spawn_packet(0, (size_t)request_size);
}

static int64_t process_dispatch(int pid, int tid, uint32_t operation,
                               uintptr_t request_size,
                               uintptr_t response_capacity) {
  deferred_milliseconds = -1;
  if (request_size > sizeof(process_mailbox) ||
      response_capacity > sizeof(process_mailbox)) return -E2BIG;
  dolly_kernel_process *process = find_process(pid);
  if (process == NULL) return -ESRCH;
  if (process->state != DOLLY_KERNEL_PROCESS_RUNNING &&
      operation != DOLLY_PROCESS_EXIT) return -ESRCH;
  if ((!tid || tid == process->signal_tid) && process->pending_signals && !process->handling_signal &&
      operation != DOLLY_PROCESS_INTERRUPT_POLL &&
      operation != DOLLY_PROCESS_SIGNAL_ACKNOWLEDGE &&
      operation != DOLLY_PROCESS_EXIT) return -EINTR;

  dolly_kernel_thread *thread = find_thread(process, tid);
  if (tid && (!thread || thread->retired)) return -ESRCH;
  const dolly_kernel_module *module = module_for(operation);
  if (module) return module->call(pid, tid, operation, process_mailbox, request_size, response_capacity);
  switch (operation) {
    case DOLLY_PROCESS_ARGUMENT_SIZES:
      if (request_size != 0) return -EINVAL;
      return vector_sizes(process->arguments, process->argument_count,
                          response_capacity);
    case DOLLY_PROCESS_ARGUMENTS:
      if (request_size != 0) return -EINVAL;
      return vector_bytes(process->arguments, process->argument_count,
                          response_capacity);
    case DOLLY_PROCESS_ENVIRONMENT_SIZES:
      if (request_size != 0) return -EINVAL;
      return vector_sizes(process->environment, process->environment_count,
                          response_capacity);
    case DOLLY_PROCESS_ENVIRONMENT:
      if (request_size != 0) return -EINVAL;
      return vector_bytes(process->environment, process->environment_count,
                          response_capacity);
    case DOLLY_PROCESS_FD_READ:
      return fd_read_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_FD_PREAD:
      return fd_pread_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_FD_PWRITE:
      return fd_pwrite_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_FD_WRITE:
      return fd_write_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_FD_CLOSE: {
      uint32_t guest;
      const int result = decode_fd_request(process, request_size, &guest);
      if (result == 0) release_descriptor(process, guest);
      return result;
    }
    case DOLLY_PROCESS_FD_SEEK: {
      if (request_size != sizeof(dolly_process_fd_seek_request) ||
          response_capacity < sizeof(dolly_process_fd_seek_response)) return -EINVAL;
      dolly_process_fd_seek_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      int descriptor = descriptor_for(process, request.descriptor);
      if (descriptor < 0) return descriptor;
      static const int whence[] = {
          [DOLLY_PROCESS_SEEK_SET] = SEEK_SET,
          [DOLLY_PROCESS_SEEK_CURRENT] = SEEK_CUR,
          [DOLLY_PROCESS_SEEK_END] = SEEK_END,
      };
      if (request.whence > DOLLY_PROCESS_SEEK_END) return -EINVAL;
      off_t offset = lseek(descriptor, (off_t)request.offset, whence[request.whence]);
      if (offset < 0) return -errno;
      dolly_process_fd_seek_response response = {(uint64_t)offset};
      return respond(&response, sizeof(response));
    }
    case DOLLY_PROCESS_FD_SYNC: {
      uint32_t guest;
      int descriptor = decode_fd_request(process, request_size, &guest);
      if (descriptor == 0) descriptor = descriptor_for(process, guest);
      if (descriptor < 0) return descriptor;
      return fsync(descriptor) == 0 ? 0 : -errno;
    }
    case DOLLY_PROCESS_FD_TRUNCATE: {
      if (request_size != sizeof(dolly_process_fd_truncate_request)) return -EINVAL;
      dolly_process_fd_truncate_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.reserved != 0 || request.size > INT64_MAX) return -EINVAL;
      int descriptor = descriptor_for(process, request.descriptor);
      if (descriptor < 0) return descriptor;
      return ftruncate(descriptor, (off_t)request.size) == 0 ? 0 : -errno;
    }
    case DOLLY_PROCESS_FD_STAT_FILESYSTEM: {
      if (response_capacity < sizeof(dolly_process_filesystem_stat_response)) return -EINVAL;
      uint32_t guest;
      int descriptor = decode_fd_request(process, request_size, &guest);
      if (descriptor == 0) descriptor = descriptor_for(process, guest);
      if (descriptor < 0) return descriptor;
      struct stat metadata;
      if (fstat(descriptor, &metadata) != 0) return -errno;
      dolly_process_filesystem_stat_response response;
      encode_filesystem_stat(&response);
      return respond(&response, sizeof(response));
    }
    case DOLLY_PROCESS_FD_SET_TIMES: {
      if (request_size != sizeof(dolly_process_fd_times_request) ||
          response_capacity != 0) return -EINVAL;
      dolly_process_fd_times_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.reserved != 0) return -EINVAL;
      int descriptor = descriptor_for(process, request.descriptor);
      if (descriptor < 0) return descriptor;
      struct timespec times[2];
      int result = decode_timestamps(
          &request.access, &request.modification, times);
      if (result == 0 && futimens(descriptor, times) != 0) result = -errno;
      return result;
    }
    case DOLLY_PROCESS_FD_DUP: {
      if (request_size != sizeof(dolly_process_fd_dup_request) ||
          response_capacity < sizeof(dolly_process_fd_dup_response)) return -EINVAL;
      dolly_process_fd_dup_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if ((request.flags & ~(DOLLY_PROCESS_FD_DUP_MINIMUM | DOLLY_PROCESS_FD_DUP_CLOEXEC)) != 0 ||
          request.reserved != 0) return -EINVAL;
      if (!descriptor_is_open(process, request.source_descriptor)) return -EBADF;
      const int minimum = (request.flags & DOLLY_PROCESS_FD_DUP_MINIMUM) != 0;
      if (minimum && request.target_descriptor >= DOLLY_KERNEL_DESCRIPTOR_LIMIT) {
        return -EINVAL;
      }
      if (!minimum && request.target_descriptor == request.source_descriptor) {
        if (request.flags != 0) return -EINVAL;
        const int target = (int)request.target_descriptor;
        dolly_process_fd_dup_response response = {(uint32_t)target, 0};
        return respond(&response, sizeof(response));
      }
      int target;
      if (minimum) {
        target = unused_descriptor(process, request.target_descriptor);
      } else if (request.target_descriptor == UINT32_MAX) {
        target = unused_descriptor(process, 0);
      } else if (request.target_descriptor >= DOLLY_KERNEL_DESCRIPTOR_LIMIT) {
        return -EBADF;
      } else {
        target = (int)request.target_descriptor;
      }
      if (target < 0) return target;
      const int result = copy_descriptor(process, process, request.source_descriptor, (uint32_t)target);
      if (result != 0) return result;
      process->descriptor_flags[target] = (request.flags & DOLLY_PROCESS_FD_DUP_CLOEXEC)
          ? DOLLY_PROCESS_FD_CLOEXEC : 0;
      dolly_process_fd_dup_response response = {(uint32_t)target, 0};
      return respond(&response, sizeof(response));
    }
    case DOLLY_PROCESS_FD_GET_DESCRIPTOR_FLAGS: {
      if (response_capacity < sizeof(dolly_process_fd_flags)) return -EINVAL;
      uint32_t guest;
      const int result = decode_fd_request(process, request_size, &guest);
      if (result != 0) return result;
      const dolly_process_fd_flags response = {guest, process->descriptor_flags[guest]};
      return respond(&response, sizeof(response));
    }
    case DOLLY_PROCESS_FD_SET_DESCRIPTOR_FLAGS: {
      if (request_size != sizeof(dolly_process_fd_flags) || response_capacity != 0) return -EINVAL;
      dolly_process_fd_flags request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (!descriptor_is_open(process, request.descriptor)) return -EBADF;
      if (request.flags & ~DOLLY_PROCESS_FD_CLOEXEC) return -EINVAL;
      process->descriptor_flags[request.descriptor] = (unsigned char)request.flags;
      return 0;
    }
    case DOLLY_PROCESS_FD_GET_FLAGS: {
      if (response_capacity < sizeof(dolly_process_fd_flags)) return -EINVAL;
      uint32_t guest;
      const int result = decode_fd_request(process, request_size, &guest);
      if (result != 0) return result;
      uint32_t flags;
      if (process->pipes[guest] != NULL) {
        const unsigned end = process->pipe_directions[guest] - 1;
        flags = end == 0 ? DOLLY_PROCESS_FD_STATUS_READ : DOLLY_PROCESS_FD_STATUS_WRITE;
        if (process->pipes[guest]->nonblocking[end]) flags |= DOLLY_PROCESS_FD_STATUS_NONBLOCK;
      } else {
        const int descriptor = descriptor_for(process, guest);
        if (descriptor < 0) return descriptor;
        const int status = fcntl(descriptor, F_GETFL);
        if (status < 0) return -errno;
        const int access = status & O_ACCMODE;
        flags = (access != O_WRONLY ? DOLLY_PROCESS_FD_STATUS_READ : 0) |
            (access != O_RDONLY ? DOLLY_PROCESS_FD_STATUS_WRITE : 0) |
            (status & O_APPEND ? DOLLY_PROCESS_FD_STATUS_APPEND : 0) |
            (status & O_NONBLOCK ? DOLLY_PROCESS_FD_STATUS_NONBLOCK : 0);
      }
      const dolly_process_fd_flags response = {guest, flags};
      return respond(&response, sizeof(response));
    }
    case DOLLY_PROCESS_FD_SET_FLAGS: {
      if (request_size != sizeof(dolly_process_fd_flags) ||
          response_capacity != 0) return -EINVAL;
      dolly_process_fd_flags request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (!descriptor_is_open(process, request.descriptor)) return -EBADF;
      if (request.flags & ~(DOLLY_PROCESS_FD_STATUS_APPEND | DOLLY_PROCESS_FD_STATUS_NONBLOCK)) {
        return -EINVAL;
      }
      const int nonblocking = (request.flags & DOLLY_PROCESS_FD_STATUS_NONBLOCK) != 0;
      if (process->pipes[request.descriptor] != NULL) {
        if (request.flags & DOLLY_PROCESS_FD_STATUS_APPEND) return -ENOTSUP;
        const unsigned end = process->pipe_directions[request.descriptor] - 1;
        process->pipes[request.descriptor]->nonblocking[end] = (unsigned char)nonblocking;
        return 0;
      }
      const int descriptor = descriptor_for(process, request.descriptor);
      if (descriptor < 0) return descriptor;
      int status = fcntl(descriptor, F_GETFL);
      if (status < 0) return -errno;
      status &= ~(O_APPEND | O_NONBLOCK);
      if (request.flags & DOLLY_PROCESS_FD_STATUS_APPEND) status |= O_APPEND;
      if (nonblocking) status |= O_NONBLOCK;
      return fcntl(descriptor, F_SETFL, status) == 0 ? 0 : -errno;
    }
    case DOLLY_PROCESS_FD_PIPE: {
      if (request_size != sizeof(dolly_process_pipe_request) ||
          response_capacity < sizeof(dolly_process_pipe_response)) return -EINVAL;
      dolly_process_pipe_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.reserved != 0 || (request.flags & ~DOLLY_PROCESS_FD_CLOEXEC)) return -EINVAL;
      if (live_pipe_count >= DOLLY_KERNEL_PIPE_LIMIT) return -ENFILE;
      dolly_kernel_pipe *pipe = calloc(1, sizeof(*pipe));
      if (pipe == NULL) return -ENOMEM;
      ++live_pipe_count;
      int read_descriptor = allocate_pipe_descriptor(
          process, pipe, DOLLY_KERNEL_PIPE_READ);
      if (read_descriptor < 0) {
        free(pipe);
        --live_pipe_count;
        return read_descriptor;
      }
      int write_descriptor = allocate_pipe_descriptor(
          process, pipe, DOLLY_KERNEL_PIPE_WRITE);
      if (write_descriptor < 0) {
        release_descriptor(process, (uint32_t)read_descriptor);
        return write_descriptor;
      }
      process->descriptor_flags[read_descriptor] = (unsigned char)request.flags;
      process->descriptor_flags[write_descriptor] = (unsigned char)request.flags;
      dolly_process_pipe_response response = {
          (uint32_t)read_descriptor, (uint32_t)write_descriptor,
      };
      return respond(&response, sizeof(response));
    }
    case DOLLY_PROCESS_FD_READ_DIRECTORY:
      return fd_read_directory_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_FD_STAT: {
      if (response_capacity < sizeof(dolly_process_stat_response)) return -EINVAL;
      uint32_t guest;
      const int result = decode_fd_request(process, request_size, &guest);
      if (result != 0) return result;
      dolly_process_stat_response response = {
          .mode = 0600, .link_count = 1, .block_size = 4096,
          .file_type = DOLLY_PROCESS_FILE_FIFO,
      };
      if (process->pipes[guest] == NULL) {
        struct stat metadata;
        if (fstat(process->descriptors[guest], &metadata) != 0) return -errno;
        encode_stat(&metadata, &response);
        if (process->terminal_descriptors[guest]) {
          response.file_type = DOLLY_PROCESS_FILE_CHARACTER_DEVICE;
        }
      }
      return respond(&response, sizeof(response));
    }
    case DOLLY_PROCESS_PATH_OPEN: {
      if (response_capacity < sizeof(dolly_process_path_open_response)) return -ENOBUFS;
      dolly_process_path_request request;
      char *path = NULL;
      int directory = AT_FDCWD;
      int result = decode_path_request(process, request_size, UINT32_MAX,
                                       &request, &path, &directory);
      int flags = result == 0 ? open_flags(request.flags) : result;
      if (flags < 0) result = flags;
      int guest_fd = result == 0 ? unused_descriptor(process, 0) : -1;
      if (result == 0 && guest_fd < 0) result = guest_fd;
      int kernel_fd = -1;
      if (result == 0) {
        kernel_fd = openat(directory, path, flags, 0666);
        if (kernel_fd < 0) result = -errno;
      }
      free(path);
      if (result != 0) return result;
      const int stream = standard_stream(kernel_fd);
      if (stream >= 0) {
        close(kernel_fd);
        result = copy_descriptor(process, process, (uint32_t)stream, (uint32_t)guest_fd);
        if (result != 0) return result;
      } else {
        process->descriptors[guest_fd] = kernel_fd;
        process->terminal_descriptors[guest_fd] = controlling_terminal(kernel_fd);
      }
      process->descriptor_flags[guest_fd] = (request.flags & DOLLY_PROCESS_OPEN_CLOEXEC)
          ? DOLLY_PROCESS_FD_CLOEXEC : 0;
      dolly_process_path_open_response response = {(uint32_t)guest_fd, 0};
      return respond(&response, sizeof(response));
    }
    case DOLLY_PROCESS_PATH_STAT: {
      if (response_capacity < sizeof(dolly_process_stat_response)) return -ENOBUFS;
      dolly_process_path_request request;
      char *path = NULL;
      int directory = AT_FDCWD;
      int result = decode_path_request(process, request_size,
                                       DOLLY_PROCESS_PATH_NOFOLLOW,
                                       &request, &path, &directory);
      struct stat metadata;
      if (result == 0 &&
          fstatat(directory, path, &metadata,
                  (request.flags & DOLLY_PROCESS_PATH_NOFOLLOW) != 0
                      ? AT_SYMLINK_NOFOLLOW : 0) != 0) result = -errno;
      free(path);
      if (result != 0) return result;
      dolly_process_stat_response response;
      encode_stat(&metadata, &response);
      return respond(&response, sizeof(response));
    }
    case DOLLY_PROCESS_PATH_CREATE_DIRECTORY: {
      dolly_process_path_request request;
      char *path = NULL;
      int directory = AT_FDCWD;
      int result = decode_path_request(process, request_size, 0, &request,
                                       &path, &directory);
      if (result == 0 && mkdirat(directory, path, 0777) != 0) result = -errno;
      free(path);
      return result;
    }
    case DOLLY_PROCESS_PATH_REMOVE: {
      dolly_process_path_request request;
      char *path = NULL;
      int directory = AT_FDCWD;
      int result = decode_path_request(process, request_size,
                                       DOLLY_PROCESS_PATH_DIRECTORY,
                                       &request, &path, &directory);
      if (result == 0 && unlinkat(
          directory, path,
          (request.flags & DOLLY_PROCESS_PATH_DIRECTORY) != 0 ? AT_REMOVEDIR : 0) != 0) {
        result = -errno;
      }
      free(path);
      return result;
    }
    case DOLLY_PROCESS_PATH_RENAME:
    case DOLLY_PROCESS_PATH_LINK: {
      dolly_process_two_path_request request;
      const int invalid = decode_two_path_request(request_size, &request);
      if (invalid != 0) return invalid;
      char *old_path = NULL;
      char *new_path = NULL;
      int old_directory = AT_FDCWD;
      int new_directory = AT_FDCWD;
      int result = path_from_packet(
          process, request.old_directory_descriptor,
          process_mailbox + sizeof(request), request.old_path_size,
          &old_path, &old_directory);
      if (result == 0) result = path_from_packet(
          process, request.new_directory_descriptor,
          process_mailbox + sizeof(request) + request.old_path_size,
          request.new_path_size, &new_path, &new_directory);
      if (result == 0) {
        const int call_result = operation == DOLLY_PROCESS_PATH_RENAME
            ? renameat(old_directory, old_path, new_directory, new_path)
            : linkat(old_directory, old_path, new_directory, new_path, 0);
        if (call_result != 0) result = -errno;
      }
      free(old_path);
      free(new_path);
      return result;
    }
    case DOLLY_PROCESS_PATH_SYMLINK: {
      dolly_process_two_path_request request;
      const int invalid = decode_two_path_request(request_size, &request);
      if (invalid != 0) return invalid;
      if (request.old_directory_descriptor != UINT32_MAX) return -EINVAL;
      const unsigned char *target_bytes = process_mailbox + sizeof(request);
      if (memchr(target_bytes, 0, request.old_path_size) != NULL) return -EINVAL;
      char *target = malloc((size_t)request.old_path_size + 1);
      if (target == NULL) return -ENOMEM;
      memcpy(target, target_bytes, request.old_path_size);
      target[request.old_path_size] = 0;
      char *link_path = NULL;
      int directory = AT_FDCWD;
      int result = path_from_packet(
          process, request.new_directory_descriptor,
          target_bytes + request.old_path_size, request.new_path_size,
          &link_path, &directory);
      if (result == 0 && symlinkat(target, directory, link_path) != 0) result = -errno;
      free(target);
      free(link_path);
      return result;
    }
    case DOLLY_PROCESS_PATH_READLINK: {
      dolly_process_path_request request;
      char *path = NULL;
      int directory = AT_FDCWD;
      int result = decode_path_request(process, request_size, 0, &request,
                                       &path, &directory);
      if (result == 0) {
        if (strcmp(path, "/proc/self/exe") == 0) {
          if (response_capacity == 0) result = -EINVAL;
          else {
            size_t count = strlen(process->path);
            if (count > response_capacity) count = response_capacity;
            memcpy(process_mailbox, process->path, count);
            result = (int)count;
          }
        } else {
          ssize_t count = readlinkat(directory, path, (char *)process_mailbox,
                                     response_capacity);
          result = count < 0 ? -errno : (int)count;
        }
      }
      free(path);
      return result;
    }
    case DOLLY_PROCESS_PATH_GET_CURRENT_DIRECTORY: {
      if (request_size != 0) return -EINVAL;
      if (response_capacity == 0) return -ENOBUFS;
      const int result = directory_path(process->current_directory,
          (char *)process_mailbox, response_capacity);
      return result < 0 ? result : (int64_t)strlen((char *)process_mailbox) + 1;
    }
    case DOLLY_PROCESS_PATH_SET_CURRENT_DIRECTORY: {
      dolly_process_path_request request;
      char *path = NULL;
      int directory = AT_FDCWD;
      int result = decode_path_request(process, request_size, 0, &request,
                                       &path, &directory);
      int descriptor = -1;
      if (result == 0) {
        descriptor = openat(directory, path, O_RDONLY | O_DIRECTORY);
        if (descriptor < 0) result = -errno;
      }
      free(path);
      if (result != 0) return result;
      close(process->current_directory);
      process->current_directory = descriptor;
      return 0;
    }
    case DOLLY_PROCESS_PATH_STAT_FILESYSTEM: {
      if (response_capacity < sizeof(dolly_process_filesystem_stat_response)) {
        return -ENOBUFS;
      }
      dolly_process_path_request request;
      char *path = NULL;
      int directory = AT_FDCWD;
      int result = decode_path_request(process, request_size, 0, &request,
                                       &path, &directory);
      struct stat metadata;
      if (result == 0 && fstatat(directory, path, &metadata, 0) != 0) {
        result = -errno;
      }
      free(path);
      if (result != 0) return result;
      dolly_process_filesystem_stat_response response;
      encode_filesystem_stat(&response);
      return respond(&response, sizeof(response));
    }
    case DOLLY_PROCESS_PATH_SET_TIMES: {
      if (request_size < sizeof(dolly_process_path_times_request) ||
          response_capacity != 0) return -EINVAL;
      dolly_process_path_times_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.reserved != 0 || request.path_size == 0 ||
          request.path_size != request_size - sizeof(request) ||
          (request.flags & ~DOLLY_PROCESS_PATH_NOFOLLOW) != 0) return -EINVAL;
      char *path = NULL;
      int directory = AT_FDCWD;
      int result = path_from_packet(
          process, request.directory_descriptor,
          process_mailbox + sizeof(request), request.path_size,
          &path, &directory);
      struct timespec times[2];
      if (result == 0) result = decode_timestamps(
          &request.access, &request.modification, times);
      if (result == 0 && utimensat(
          directory, path, times,
          (request.flags & DOLLY_PROCESS_PATH_NOFOLLOW) != 0
              ? AT_SYMLINK_NOFOLLOW : 0) != 0) result = -errno;
      free(path);
      return result;
    }
    case DOLLY_PROCESS_SPAWN: {
      if (response_capacity < sizeof(dolly_process_spawn_response)) return -ENOBUFS;
      int child = spawn_packet(pid, (size_t)request_size);
      if (child < 0) return child;
      dolly_process_spawn_response response = {(uint32_t)child, 0};
      return respond(&response, sizeof(response));
    }
    case DOLLY_PROCESS_WAIT: {
      if (request_size != sizeof(dolly_process_wait_request) ||
          response_capacity < sizeof(dolly_process_wait_response)) return -EINVAL;
      dolly_process_wait_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if ((request.flags & ~DOLLY_PROCESS_WAIT_NONBLOCK) != 0) return -EINVAL;
      int children = 0;
      dolly_kernel_process *child = NULL;
      for (size_t index = 0; index < DOLLY_KERNEL_PROCESS_LIMIT && child == NULL; ++index) {
        dolly_kernel_process *candidate = &process_table[index];
        if (candidate->state == DOLLY_KERNEL_PROCESS_FREE || candidate->parent_pid != pid ||
            (request.pid != 0 && (uint32_t)candidate->pid != request.pid)) continue;
        ++children;
        if (candidate->state == DOLLY_KERNEL_PROCESS_EXITED && candidate->worker_retired) {
          child = candidate;
        }
      }
      if (children == 0) return -ECHILD;
      if (child == NULL) {
        return (request.flags & DOLLY_PROCESS_WAIT_NONBLOCK) != 0
            ? -EAGAIN : DOLLY_PROCESS_DISPATCH_DEFERRED;
      }
      const dolly_process_wait_response response = {
          (uint32_t)child->pid, (uint32_t)child->status, (uint32_t)child->exit_signal, 0,
      };
      dispose_process(child);
      return respond(&response, sizeof(response));
    }
    case DOLLY_PROCESS_INFO: {
      if (request_size != 0 || response_capacity < sizeof(dolly_process_info_response)) return -EINVAL;
      const dolly_process_info_response response = {
          (uint32_t)process->pid, (uint32_t)process->parent_pid,
      };
      return respond(&response, sizeof(response));
    }
    case DOLLY_PROCESS_SIGNAL: {
      if (request_size != sizeof(dolly_process_signal_request) ||
          response_capacity < sizeof(dolly_process_signal_request)) return -EINVAL;
      dolly_process_signal_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.pid == 0 || request.pid > INT32_MAX ||
          !supported_signal(request.signal_number)) return -ENOTSUP;
      const int result = dolly_process_signal((int)request.pid, (int)request.signal_number);
      if (result != 0) return result;
      return respond(&request, sizeof(request));
    }
    case DOLLY_PROCESS_INTERRUPT_POLL: {
      if (request_size != 0 || response_capacity < sizeof(int32_t)) return -EINVAL;
      const int32_t response = process->handling_signal || (tid && tid != process->signal_tid) ? 0 : next_signal(process);
      if (response) {
        process->pending_signals &= ~(1u << response);
        process->handling_signal = response;
      }
      return respond(&response, sizeof(response));
    }
    case DOLLY_PROCESS_SIGNAL_ACKNOWLEDGE: {
      if (tid && tid != process->signal_tid) return -EPERM;
      if (request_size != sizeof(int32_t) || response_capacity < sizeof(int32_t)) return -EINVAL;
      int32_t number;
      memcpy(&number, process_mailbox, sizeof(number));
      if (!number || number != process->handling_signal) return -EINVAL;
      process->handling_signal = 0;
      const int32_t remaining = next_signal(process);
      return respond(&remaining, sizeof(remaining));
    }
    case DOLLY_PROCESS_ALARM: {
      if ((request_size != 0 && request_size != sizeof(dolly_process_alarm)) ||
          response_capacity < sizeof(dolly_process_alarm)) return -EINVAL;
      const uint64_t now = clock_nanoseconds(CLOCK_MONOTONIC);
      /* A due timer reports time left until the supervisor raises it. */
      const dolly_process_alarm previous = {
          process->alarm_deadline == 0 ? 0
              : process->alarm_deadline > now ? process->alarm_deadline - now : 1,
          process->alarm_interval,
      };
      if (request_size != 0) {
        dolly_process_alarm request;
        memcpy(&request, process_mailbox, sizeof(request));
        const int armed = request.value_nanoseconds != 0;
        process->alarm_deadline = armed ? saturating_add(now, request.value_nanoseconds) : 0;
        process->alarm_interval = armed ? request.interval_nanoseconds : 0;
      }
      return respond(&previous, sizeof(previous));
    }
    case DOLLY_PROCESS_ALARM_HANDLED: {
      int32_t handled;
      if (request_size != sizeof(handled) || response_capacity != 0) return -EINVAL;
      memcpy(&handled, process_mailbox, sizeof(handled));
      if (handled != 0 && handled != 1) return -EINVAL;
      process->alarm_handled = handled;
      return 0;
    }
    case DOLLY_PROCESS_TERMINAL:
      return terminal_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_CLOCK_TIME: {
      if (request_size != sizeof(dolly_process_clock_request) ||
          response_capacity < sizeof(dolly_process_clock_response)) return -EINVAL;
      dolly_process_clock_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      clockid_t clock;
      if (request.reserved != 0 || process_clock(request.clock_id, &clock) != 0) return -EINVAL;
      const dolly_process_clock_response response = {clock_nanoseconds(clock)};
      return respond(&response, sizeof(response));
    }
    case DOLLY_PROCESS_CLOCK_RESOLUTION: {
      if (request_size != sizeof(dolly_process_clock_request) ||
          response_capacity < sizeof(dolly_process_clock_response)) return -EINVAL;
      dolly_process_clock_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      clockid_t clock;
      if (request.reserved != 0 || process_clock(request.clock_id, &clock) != 0 ||
          request.precision_nanoseconds != 0) return -EINVAL;
      struct timespec value;
      if (clock_getres(clock, &value) != 0) return -errno;
      dolly_process_clock_response response = {
          (uint64_t)value.tv_sec * 1000000000u + (uint64_t)value.tv_nsec,
      };
      return respond(&response, sizeof(response));
    }
    case DOLLY_PROCESS_CLOCK_SLEEP: {
      if (request_size != sizeof(dolly_process_clock_sleep_request) ||
          response_capacity != 0) return -EINVAL;
      dolly_process_clock_sleep_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      clockid_t clock;
      if (request.flags != 0 || process_clock(request.clock_id, &clock) != 0) return -EINVAL;
      const uint64_t now = clock_nanoseconds(clock);
      if (now >= request.deadline_nanoseconds) return 0;
      deferred_milliseconds = (double)(request.deadline_nanoseconds - now) / 1000000.0;
      return DOLLY_PROCESS_DISPATCH_DEFERRED;
    }
    case DOLLY_PROCESS_FD_POLL:
      return fd_poll_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_RANDOM: {
      if (request_size != 0) return -EINVAL;
      size_t offset = 0;
      while (offset < response_capacity) {
        const size_t chunk = response_capacity - offset > 256
            ? 256 : response_capacity - offset;
        if (getentropy(process_mailbox + offset, chunk) != 0) return -errno;
        offset += chunk;
      }
      return (int64_t)response_capacity;
    }
    case DOLLY_PROCESS_EXIT: {
      if (request_size != sizeof(dolly_process_exit_request)) return -EINVAL;
      dolly_process_exit_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.status > 255 || !supported_signal(request.signal_number) ||
          (request.signal_number != 0 && request.status != 128 + request.signal_number)) return -EINVAL;
      /* Waking a blocking operation with EINTR must not let an otherwise
       * signal-unaware program turn Ctrl-C into an arbitrary failure status.
       * A runtime that deliberately handles SIGINT acknowledges it through
       * DOLLY_PROCESS_INTERRUPT_POLL. */
      const uint32_t terminating = process->pending_signals & ~notification_signals(process);
      const int signal_number = request.signal_number != 0
          ? (int)request.signal_number : (terminating ? __builtin_ctz(terminating) : 0);
      const int status = signal_number != 0 ? 128 + signal_number : (int)request.status;
      /* A foreground-tree interrupt must let children finish their own
       * handlers before a parent's exit reclaims the subtree. */
      for (size_t index = 0; index < DOLLY_KERNEL_PROCESS_LIMIT; ++index) {
        const dolly_kernel_process *child = &process_table[index];
        if (child->parent_pid == process->pid && child->state == DOLLY_KERNEL_PROCESS_RUNNING &&
            ((child->pending_signals & ~notification_signals(child)) ||
             (child->handling_signal && !(notification_signals(child) & (1u << child->handling_signal)))))
          return DOLLY_PROCESS_DISPATCH_DEFERRED;
      }
      mark_process_exited(process, status, signal_number);
      return 0;
    }
    default:
      return -ENOSYS;
  }
}

int64_t dolly_process_dispatch(int pid, uint32_t operation,
                               uintptr_t request_size,
                               uintptr_t response_capacity) {
  return process_dispatch(pid, 0, operation, request_size, response_capacity);
}

int dolly_threads_attach(int pid) {
  dolly_kernel_process *process = find_process(pid);
  if (!process || process->state != DOLLY_KERNEL_PROCESS_PENDING) return -ESRCH;
  if (process->signal_tid) return -EALREADY;
  int tid = allocate_thread(process);
  if (tid > 0) process->signal_tid = tid;
  return tid;
}

int dolly_threads_unstarted(int pid, int tid) {
  dolly_kernel_process *process = find_process(pid);
  dolly_kernel_thread *thread = process ? find_thread(process, tid) : NULL;
  if (!thread || tid == process->signal_tid) return -ESRCH;
  release_modules(pid, tid);
  memset(thread, 0, sizeof(*thread));
  return 0;
}

int dolly_threads_retired(int pid, int tid, uint64_t result) {
  dolly_kernel_process *process = find_process(pid);
  dolly_kernel_thread *thread = process ? find_thread(process, tid) : NULL;
  if (!thread || thread->retired || process->state != DOLLY_KERNEL_PROCESS_RUNNING)
    return -ESRCH;
  thread->result = result;
  thread->retired = 1;
  release_modules(pid, tid);
  int receiver = 0;
  for (size_t i = 0; i < DOLLY_KERNEL_THREAD_LIMIT; ++i) {
    dolly_kernel_thread *other = &process->threads[i];
    if (other->waiter == tid) other->waiter = 0;
    if (other->tid && !other->retired && (!receiver || other->tid < receiver))
      receiver = other->tid;
  }
  if (process->signal_tid == tid) process->signal_tid = receiver;
  return receiver == 0;
}

int64_t dolly_threads_dispatch(int pid, int tid, uint32_t operation,
                               uintptr_t request_size,
                               uintptr_t response_capacity) {
  deferred_milliseconds = -1;
  dolly_kernel_process *process = find_process(pid);
  dolly_kernel_thread *thread = process ? find_thread(process, tid) : NULL;
  if (!thread || thread->retired || process->state != DOLLY_KERNEL_PROCESS_RUNNING)
    return -ESRCH;
  if (thread->waiting_on) {
    dolly_thread_wait_request request = {0};
    if (operation == DOLLY_THREAD_WAIT && request_size == 8 && response_capacity == 8)
      memcpy(&request, process_mailbox, 8);
    if (request.tid != (uint32_t)thread->waiting_on || request.flags) {
      /* A different call abandons an interrupted wait, including signal polling. */
      dolly_kernel_thread *target = find_thread(process, thread->waiting_on);
      if (target && target->waiter == tid) target->waiter = 0;
      thread->waiting_on = 0;
    }
  }
  if (request_size > sizeof(process_mailbox) || response_capacity > sizeof(process_mailbox))
    return -E2BIG;
  if (operation < DOLLY_THREAD_SPAWN || operation > DOLLY_THREAD_WAIT)
    return process_dispatch(pid, tid, operation, request_size, response_capacity);
  switch (operation) {
    case DOLLY_THREAD_SPAWN: {
      if (request_size != 8 || response_capacity != 8) return -EINVAL;
      int child = allocate_thread(process);
      if (child < 0) return child;
      dolly_thread_identity response = {(uint32_t)child, 0};
      memcpy(process_mailbox, &response, 8);
      return 8;
    }
    case DOLLY_THREAD_SELF: {
      if (request_size || response_capacity != 8) return -EINVAL;
      dolly_thread_identity response = {(uint32_t)tid, 0};
      memcpy(process_mailbox, &response, 8);
      return 8;
    }
    case DOLLY_THREAD_EXIT:
      /* The Worker unwinds to its trusted JS entry wrapper first. The
       * supervisor publishes retirement only after guest code has stopped. */
      return request_size == 8 && !response_capacity ? 0 : -EINVAL;
    case DOLLY_THREAD_WAIT: {
      if (request_size != 8 || response_capacity != 8) return -EINVAL;
      dolly_thread_wait_request request;
      memcpy(&request, process_mailbox, 8);
      if (request.flags & ~DOLLY_THREAD_WAIT_NONBLOCK) return -EINVAL;
      if (request.tid == (uint32_t)tid) return -EDEADLK;
      dolly_kernel_thread *target = find_thread(process, (int)request.tid);
      if (!target) return -ESRCH;
      if (target->waiter && target->waiter != tid) return -EINVAL;
      if (!target->retired) {
        if (request.flags & DOLLY_THREAD_WAIT_NONBLOCK) return -EAGAIN;
        /* Like other blocking calls, the signal thread's wait yields to its signals. */
        if (tid == process->signal_tid && process->pending_signals && !process->handling_signal)
          return -EINTR;
        target->waiter = tid;
        thread->waiting_on = target->tid;
        return DOLLY_PROCESS_DISPATCH_DEFERRED;
      }
      memcpy(process_mailbox, &target->result, 8);
      memset(target, 0, sizeof(*target));
      thread->waiting_on = 0;
      return 8;
    }
  }
  return -ENOSYS;
}

int dolly_process_next_launch(void) {
  for (size_t index = 0; index < DOLLY_KERNEL_PROCESS_LIMIT; ++index) {
    if (process_table[index].state == DOLLY_KERNEL_PROCESS_PENDING &&
        process_table[index].image != NULL) return process_table[index].pid;
  }
  return 0;
}

uintptr_t dolly_process_image_address(int pid) {
  dolly_kernel_process *process = find_process(pid);
  return process != NULL && process->state == DOLLY_KERNEL_PROCESS_PENDING
      ? (uintptr_t)process->image : 0;
}

uintptr_t dolly_process_image_size(int pid) {
  dolly_kernel_process *process = find_process(pid);
  return process != NULL && process->state == DOLLY_KERNEL_PROCESS_PENDING
      ? process->image_size : 0;
}

int dolly_process_image_consumed(int pid) {
  dolly_kernel_process *process = find_process(pid);
  if (process == NULL || process->state != DOLLY_KERNEL_PROCESS_PENDING ||
      process->image == NULL) return -EINVAL;
  free(process->image);
  process->image = NULL;
  process->image_size = 0;
  return 0;
}

int dolly_process_worker_started(int pid) {
  dolly_kernel_process *process = find_process(pid);
  if (process == NULL || process->state != DOLLY_KERNEL_PROCESS_PENDING ||
      process->image != NULL) return -EINVAL;
  process->state = DOLLY_KERNEL_PROCESS_RUNNING;
  return 0;
}

int dolly_process_worker_exited(int pid, int status, int signal_number) {
  dolly_kernel_process *process = find_process(pid);
  if (process == NULL || process->state == DOLLY_KERNEL_PROCESS_EXITED) return -EINVAL;
  if (!supported_signal((uint32_t)signal_number) ||
      (signal_number != 0 && status != 128 + signal_number)) return -EINVAL;
  mark_process_exited(process, status, signal_number);
  return 0;
}

int dolly_process_exited(int pid) {
  const dolly_kernel_process *process = find_process(pid);
  return process == NULL || process->state == DOLLY_KERNEL_PROCESS_EXITED;
}

int dolly_process_worker_retired(int pid) {
  dolly_kernel_process *process = find_process(pid);
  if (process == NULL) return -ESRCH;
  if (process->state != DOLLY_KERNEL_PROCESS_EXITED) return -EINVAL;
  if (process->worker_retired) return 0;
  for (size_t index = 0; index < DOLLY_KERNEL_PROCESS_LIMIT; ++index) {
    const dolly_kernel_process *child = &process_table[index];
    if (child->state != DOLLY_KERNEL_PROCESS_FREE &&
        child->parent_pid == pid && !child->worker_retired) return -EAGAIN;
  }
  for (size_t index = 0; index < DOLLY_KERNEL_PROCESS_LIMIT; ++index) {
    dolly_kernel_process *child = &process_table[index];
    if (child->state != DOLLY_KERNEL_PROCESS_FREE && child->parent_pid == pid) {
      dispose_process(child);
    }
  }
  process->worker_retired = 1;
  /* WAIT must see the child as waitable before its parent's handler runs. */
  dolly_kernel_process *parent = find_process(process->parent_pid);
  if (parent != NULL && parent->state == DOLLY_KERNEL_PROCESS_RUNNING)
    parent->pending_signals |= 1u << DOLLY_PROCESS_SIGCHLD;
  if (foreground_pid == pid) dolly_terminal_discard_pending_input();
  refresh_foreground();
  return 0;
}

int dolly_process_spawn_flags(int pid) {
  dolly_kernel_process *process = find_process(pid);
  return process == NULL ? -ESRCH : (int)process->spawn_flags;
}

int dolly_process_signal(int pid, int signal_number) {
  dolly_kernel_process *process = find_process(pid);
  if (process == NULL || process->state == DOLLY_KERNEL_PROCESS_EXITED) {
    return -ESRCH;
  }
  if (!supported_signal((uint32_t)signal_number)) return -ENOTSUP;
  if (signal_number == 0) return 0;
  if (signal_number == DOLLY_PROCESS_SIGWINCH && process->state != DOLLY_KERNEL_PROCESS_RUNNING)
    return 0;
  if (signal_number != DOLLY_PROCESS_SIGKILL && process->state == DOLLY_KERNEL_PROCESS_RUNNING) {
    process->pending_signals |= 1u << signal_number;
  } else {
    /* SIGKILL and signals before command entry cannot run userspace handlers. */
    mark_process_exited(process, 128 + signal_number, signal_number);
  }
  return 0;
}

int dolly_process_take_alarm(void) {
  const uint64_t now = clock_nanoseconds(CLOCK_MONOTONIC);
  for (size_t index = 0; index < DOLLY_KERNEL_PROCESS_LIMIT; ++index) {
    dolly_kernel_process *process = &process_table[index];
    if (process->state != DOLLY_KERNEL_PROCESS_RUNNING || process->alarm_deadline == 0 ||
        now < process->alarm_deadline) continue;
    /* Late or missed periods collapse into one signal; the phase is kept. */
    const uint64_t interval = process->alarm_interval;
    process->alarm_deadline = interval == 0 ? 0
        : saturating_add(now, interval - (now - process->alarm_deadline) % interval);
    if (!process->alarm_handled) return process->pid;
    process->pending_signals |= 1u << DOLLY_PROCESS_SIGALRM;
  }
  return 0;
}

double dolly_process_deadline_remaining(int pid) {
  dolly_kernel_process *process = find_process(pid);
  if (process == NULL || process->deadline_nanoseconds == UINT64_MAX) return -1;
  const uint64_t now = clock_nanoseconds(CLOCK_MONOTONIC);
  return now >= process->deadline_nanoseconds
      ? 0 : (double)(process->deadline_nanoseconds - now) / 1000000.0;
}

int dolly_process_collect(int pid) {
  dolly_kernel_process *process = find_process(pid);
  if (process == NULL) return -ESRCH;
  if (process->state != DOLLY_KERNEL_PROCESS_EXITED || !process->worker_retired) return -EAGAIN;
  const int status = process->status;
  dispose_process(process);
  return status;
}

int dolly_process_parent(int pid) {
  dolly_kernel_process *process = find_process(pid);
  return process == NULL ? -ESRCH : process->parent_pid;
}
