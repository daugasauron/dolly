#include "process-kernel.h"

#include <dolly/http.h>
#include <dolly/process.h>

#include <emscripten/emscripten.h>

#include <errno.h>
#include <dirent.h>
#include <fcntl.h>
#include <limits.h>
#include <signal.h>
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
};

typedef struct {
  size_t offset;
  size_t size;
  uint32_t readers;
  uint32_t writers;
  unsigned char bytes[DOLLY_KERNEL_PIPE_CAPACITY];
} dolly_kernel_pipe;

typedef struct {
  int pid;
  int parent_pid;
  int state;
  int status;
  int descriptors[DOLLY_KERNEL_DESCRIPTOR_LIMIT];
  dolly_kernel_pipe *pipes[DOLLY_KERNEL_DESCRIPTOR_LIMIT];
  unsigned char pipe_directions[DOLLY_KERNEL_DESCRIPTOR_LIMIT];
  unsigned char terminal_descriptors[DOLLY_KERNEL_DESCRIPTOR_LIMIT];
  DIR *directories[DOLLY_KERNEL_DESCRIPTOR_LIMIT];
  char **arguments;
  uint32_t argument_count;
  char **environment;
  uint32_t environment_count;
  char *current_directory;
  char *path;
  unsigned char *image;
  size_t image_size;
  uint64_t deadline_nanoseconds;
  uint32_t http_sequence;
  int pending_signal;
} dolly_kernel_process;

_Alignas(64) static unsigned char
    process_mailbox[DOLLY_PROCESS_PACKET_LIMIT];
static dolly_kernel_process process_table[DOLLY_KERNEL_PROCESS_LIMIT];
static int next_process_pid = 100;
static uint32_t live_pipe_count;

extern char **environ;
void dolly_terminal_write_bytes(const unsigned char *bytes, uintptr_t length);
int dolly_terminal_read_raw_timeout(double milliseconds);
int dolly_terminal_raw_ready_timeout(double milliseconds);
uint32_t dolly_terminal_columns(void);
uint32_t dolly_terminal_rows(void);
int dolly_terminal_mode_get(int descriptor);
int dolly_terminal_mode_set(int descriptor, uint32_t flags);
void dolly_terminal_publish_result(int status);
int dolly_download_file(const char *path);

static dolly_kernel_process *find_process(int pid) {
  for (size_t index = 0; index < DOLLY_KERNEL_PROCESS_LIMIT; ++index) {
    if (process_table[index].state != DOLLY_KERNEL_PROCESS_FREE &&
        process_table[index].pid == pid) {
      return &process_table[index];
    }
  }
  return NULL;
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
}

static void release_process_resources(dolly_kernel_process *process) {
  if (process->http_sequence != 0) {
    (void)dolly_http_cancel(process->http_sequence);
    process->http_sequence = 0;
  }
  for (size_t index = 0; index < DOLLY_KERNEL_DESCRIPTOR_LIMIT; ++index) {
    release_descriptor(process, (uint32_t)index);
  }
  dispose_vector(&process->arguments, &process->argument_count);
  dispose_vector(&process->environment, &process->environment_count);
  free(process->current_directory);
  process->current_directory = NULL;
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

static void mark_process_exited(dolly_kernel_process *process, int status) {
  const int pid = process->pid;
  for (size_t index = 0; index < DOLLY_KERNEL_PROCESS_LIMIT; ++index) {
    dolly_kernel_process *child = &process_table[index];
    if (child->state == DOLLY_KERNEL_PROCESS_FREE || child->parent_pid != pid) continue;
    mark_process_exited(child, status);
    dispose_process(child);
  }
  dolly_kernel_display_release_owner(process->pid);
  release_process_resources(process);
  process->status = status >= 0 && status <= 255 ? status : 126;
  process->state = DOLLY_KERNEL_PROCESS_EXITED;
}

static dolly_kernel_process *allocate_process(void) {
  for (size_t index = 0; index < DOLLY_KERNEL_PROCESS_LIMIT; ++index) {
    dolly_kernel_process *process = &process_table[index];
    if (process->state != DOLLY_KERNEL_PROCESS_FREE) continue;
    memset(process, 0, sizeof(*process));
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
  int descriptor = open(process->path, O_RDONLY);
  if (descriptor < 0) return -errno;
  struct stat metadata;
  if (fstat(descriptor, &metadata) != 0) {
    const int error = errno;
    close(descriptor);
    return -error;
  }
  if (!S_ISREG(metadata.st_mode) || metadata.st_size < 8 ||
      metadata.st_size > DOLLY_KERNEL_EXECUTABLE_LIMIT) {
    close(descriptor);
    return -ENOEXEC;
  }
  process->image_size = (size_t)metadata.st_size;
  process->image = malloc(process->image_size);
  if (process->image == NULL) {
    close(descriptor);
    return -ENOMEM;
  }
  size_t offset = 0;
  while (offset < process->image_size) {
    ssize_t count = read(descriptor, process->image + offset,
                         process->image_size - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) {
      const int error = count == 0 ? EIO : errno;
      close(descriptor);
      return -error;
    }
    offset += (size_t)count;
  }
  if (close(descriptor) != 0) return -errno;
  return 0;
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
        memcmp(process->image, wasm_header, sizeof(wasm_header)) == 0) return 0;
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

static int configure_descriptors(dolly_kernel_process *process,
                                 dolly_kernel_process *parent,
                                 const dolly_process_spawn_request *request) {
  const uint32_t requested[3] = {
      request->stdin_descriptor,
      request->stdout_descriptor,
      request->stderr_descriptor,
  };
  for (size_t index = 0; index < 3; ++index) {
    if (requested[index] > INT_MAX) return -EBADF;
    int source = (int)requested[index];
    if (parent != NULL) {
      if (requested[index] >= DOLLY_KERNEL_DESCRIPTOR_LIMIT ||
          !descriptor_is_open(parent, requested[index])) return -EBADF;
      if (parent->pipes[requested[index]] != NULL) {
        process->pipes[index] = parent->pipes[requested[index]];
        process->pipe_directions[index] =
            parent->pipe_directions[requested[index]];
        retain_pipe(process->pipes[index], process->pipe_directions[index]);
        continue;
      }
      source = parent->descriptors[requested[index]];
    }
    int duplicate = dup(source);
    if (duplicate < 0) return -errno;
    process->descriptors[index] = duplicate;
    process->terminal_descriptors[index] = parent != NULL
        ? parent->terminal_descriptors[requested[index]]
        : (source >= STDIN_FILENO && source <= STDERR_FILENO);
  }
  return 0;
}

static int spawn_packet(int parent_pid, size_t size) {
  if (size < sizeof(dolly_process_spawn_request) ||
      size > sizeof(process_mailbox)) return -EINVAL;
  dolly_process_spawn_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.reserved != 0 || request.argument_count == 0 ||
      request.path_size == 0 || request.path_size > PATH_MAX ||
      (request.flags & ~DOLLY_PROCESS_SPAWN_INHERIT_ENVIRONMENT) != 0 ||
      request.argument_bytes > SIZE_MAX || request.environment_bytes > SIZE_MAX) {
    return -EINVAL;
  }
  const size_t path_size = request.path_size;
  const size_t argument_bytes = (size_t)request.argument_bytes;
  const size_t environment_bytes = (size_t)request.environment_bytes;
  if (path_size > size - sizeof(request) ||
      argument_bytes > size - sizeof(request) - path_size ||
      environment_bytes != size - sizeof(request) - path_size - argument_bytes) {
    return -EINVAL;
  }
  const unsigned char *cursor = process_mailbox + sizeof(request);
  if (memchr(cursor, 0, path_size) != NULL || cursor[0] != '/') return -EINVAL;

  dolly_kernel_process *process = allocate_process();
  if (process == NULL) return -EAGAIN;
  process->parent_pid = parent_pid;
  process->deadline_nanoseconds = request.deadline_nanoseconds;
  dolly_kernel_process *parent = parent_pid == 0 ? NULL : find_process(parent_pid);
  int result = 0;
  if (parent_pid != 0 && parent == NULL) result = -ESRCH;
  if (result == 0) {
    if (parent != NULL) {
      process->current_directory = strdup(parent->current_directory);
    } else {
      char directory[PATH_MAX];
      process->current_directory = getcwd(directory, sizeof(directory)) == NULL
          ? NULL : strdup(directory);
    }
    if (process->current_directory == NULL) result = -ENOMEM;
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
  if (result == 0) result = configure_descriptors(process, parent, &request);
  if (result == 0) result = read_image(process);
  if (result != 0) {
    dispose_process(process);
    return result;
  }
  return process->pid;
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
  memcpy(process_mailbox, &response, sizeof(response));
  return sizeof(response);
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

static int allocate_descriptor_at_least(dolly_kernel_process *process,
                                        int kernel_fd, int terminal,
                                        uint32_t minimum) {
  for (uint32_t descriptor = minimum;
       descriptor < DOLLY_KERNEL_DESCRIPTOR_LIMIT; ++descriptor) {
    if (!descriptor_is_open(process, descriptor)) {
      process->descriptors[descriptor] = kernel_fd;
      process->terminal_descriptors[descriptor] = terminal != 0;
      return (int)descriptor;
    }
  }
  return -EMFILE;
}

static int allocate_descriptor(dolly_kernel_process *process, int kernel_fd,
                               int terminal) {
  return allocate_descriptor_at_least(process, kernel_fd, terminal, 3);
}

static int allocate_pipe_descriptor_at_least(dolly_kernel_process *process,
                                             dolly_kernel_pipe *pipe,
                                             unsigned direction,
                                             uint32_t minimum) {
  for (uint32_t descriptor = minimum;
       descriptor < DOLLY_KERNEL_DESCRIPTOR_LIMIT; ++descriptor) {
    if (!descriptor_is_open(process, descriptor)) {
      process->pipes[descriptor] = pipe;
      process->pipe_directions[descriptor] = (unsigned char)direction;
      retain_pipe(pipe, direction);
      return (int)descriptor;
    }
  }
  return -EMFILE;
}

static int allocate_pipe_descriptor(dolly_kernel_process *process,
                                    dolly_kernel_pipe *pipe,
                                    unsigned direction) {
  return allocate_pipe_descriptor_at_least(process, pipe, direction, 3);
}

static int path_from_packet(dolly_kernel_process *process,
                            uint32_t directory_descriptor,
                            const unsigned char *bytes, uint32_t size,
                            char **path_out, int *directory_out) {
  if (size == 0 || size > PATH_MAX || memchr(bytes, 0, size) != NULL) {
    return -EINVAL;
  }
  char *path;
  int directory = AT_FDCWD;
  if (bytes[0] == '/') {
    path = malloc((size_t)size + 1);
    if (path == NULL) return -ENOMEM;
    memcpy(path, bytes, size);
    path[size] = 0;
  } else if (directory_descriptor == UINT32_MAX) {
    const size_t prefix = strlen(process->current_directory);
    if (prefix > PATH_MAX - (size_t)size - 2) return -ENAMETOOLONG;
    path = malloc(prefix + 1 + (size_t)size + 1);
    if (path == NULL) return -ENOMEM;
    memcpy(path, process->current_directory, prefix);
    path[prefix] = '/';
    memcpy(path + prefix + 1, bytes, size);
    path[prefix + 1 + size] = 0;
  } else {
    directory = descriptor_for(process, directory_descriptor);
    if (directory < 0) return directory;
    path = malloc((size_t)size + 1);
    if (path == NULL) return -ENOMEM;
    memcpy(path, bytes, size);
    path[size] = 0;
  }
  *path_out = path;
  *directory_out = directory;
  return 0;
}

static int decode_path_request(dolly_kernel_process *process,
                               uintptr_t request_size,
                               dolly_process_path_request *request,
                               char **path, int *directory) {
  if (request_size < sizeof(*request)) return -EINVAL;
  memcpy(request, process_mailbox, sizeof(*request));
  if (request->reserved != 0 ||
      request->path_size != request_size - sizeof(*request)) return -EINVAL;
  return path_from_packet(process, request->directory_descriptor,
                          process_mailbox + sizeof(*request),
                          request->path_size, path, directory);
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
  response->mode = metadata->st_mode;
  response->link_count = metadata->st_nlink;
  response->user = metadata->st_uid;
  response->group = metadata->st_gid;
  response->block_size = metadata->st_blksize;
  response->file_type = stable_file_type(metadata->st_mode);
}

static void encode_filesystem_stat(uint64_t files,
                                   dolly_process_filesystem_stat_response *response) {
  /*
   * WasmFS is memory-backed and has no host block device or mount quota.
   * These are the same conservative virtual-capacity values WasmFS itself
   * exposes, encoded here so a process never imports its implementation.
   */
  memset(response, 0, sizeof(*response));
  response->block_size = 4096;
  response->fragment_size = 4096;
  response->blocks = 1000000;
  response->blocks_free = 500000;
  response->blocks_available = 500000;
  response->files = files;
  response->files_free = 1000000;
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
      DOLLY_PROCESS_OPEN_DIRECTORY | DOLLY_PROCESS_OPEN_NOFOLLOW;
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
  if (request.reserved != 0 || request.descriptor >= DOLLY_KERNEL_DESCRIPTOR_LIMIT ||
      request.size > response_capacity) return -EINVAL;
  dolly_kernel_pipe *pipe = process->pipes[request.descriptor];
  if (pipe != NULL) {
    if (process->pipe_directions[request.descriptor] != DOLLY_KERNEL_PIPE_READ) {
      return -EBADF;
    }
    if (request.size == 0) return 0;
    if (pipe->size == 0) {
      return pipe->writers == 0 ? 0 : DOLLY_PROCESS_DISPATCH_DEFERRED;
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
    const int byte = dolly_terminal_read_raw_timeout(0);
    if (byte < 0) return DOLLY_PROCESS_DISPATCH_DEFERRED;
    process_mailbox[0] = (unsigned char)byte;
    return 1;
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
  memcpy(process_mailbox, &response, sizeof(response));
  return sizeof(response);
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
  if (request.reserved != 0 || request.descriptor >= DOLLY_KERNEL_DESCRIPTOR_LIMIT ||
      request.size != request_size - sizeof(request)) return -EINVAL;
  dolly_kernel_pipe *pipe = process->pipes[request.descriptor];
  if (pipe != NULL) {
    if (process->pipe_directions[request.descriptor] != DOLLY_KERNEL_PIPE_WRITE) {
      return -EBADF;
    }
    if (request.size == 0) {
      const dolly_process_io_result response = {0};
      memcpy(process_mailbox, &response, sizeof(response));
      return sizeof(response);
    }
    if (pipe->readers == 0) return -EPIPE;
    const size_t available = DOLLY_KERNEL_PIPE_CAPACITY - pipe->size;
    if (available == 0) return DOLLY_PROCESS_DISPATCH_DEFERRED;
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
    memcpy(process_mailbox, &response, sizeof(response));
    return sizeof(response);
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
  memcpy(process_mailbox, &response, sizeof(response));
  return sizeof(response);
}

static int64_t terminal_packet(dolly_kernel_process *process,
                               uintptr_t request_size,
                               uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_terminal_request) ||
      response_capacity < sizeof(dolly_process_terminal_response)) return -EINVAL;
  dolly_process_terminal_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.reserved != 0) return -EINVAL;
  dolly_process_terminal_response response = {0};
  switch (request.operation) {
    case DOLLY_PROCESS_TERMINAL_READ: {
      int descriptor = descriptor_for(process, request.descriptor);
      if (descriptor < 0) return descriptor;
      (void)descriptor;
      if (!process->terminal_descriptors[request.descriptor]) return -ENOTTY;
      const int byte = dolly_terminal_read_raw_timeout(0);
      if (byte < 0 && request.deadline_nanoseconds != 0) {
        struct timespec now;
        if (request.deadline_nanoseconds == UINT64_MAX ||
            (clock_gettime(CLOCK_MONOTONIC, &now) == 0 &&
             (uint64_t)now.tv_sec * 1000000000u + (uint64_t)now.tv_nsec <
                 request.deadline_nanoseconds)) {
          return DOLLY_PROCESS_DISPATCH_DEFERRED;
        }
      }
      response.value = byte;
      break;
    }
    case DOLLY_PROCESS_TERMINAL_ISATTY: {
      int descriptor = descriptor_for(process, request.descriptor);
      if (descriptor < 0) return descriptor;
      (void)descriptor;
      response.value = process->terminal_descriptors[request.descriptor] != 0;
      break;
    }
    case DOLLY_PROCESS_TERMINAL_MODE_GET: {
      int descriptor = descriptor_for(process, request.descriptor);
      if (descriptor < 0) return descriptor;
      (void)descriptor;
      if (!process->terminal_descriptors[request.descriptor]) return -ENOTTY;
      response.value = dolly_terminal_mode_get(STDIN_FILENO);
      if (response.value < 0) return response.value;
      break;
    }
    case DOLLY_PROCESS_TERMINAL_MODE_SET: {
      int descriptor = descriptor_for(process, request.descriptor);
      if (descriptor < 0) return descriptor;
      (void)descriptor;
      if (!process->terminal_descriptors[request.descriptor]) return -ENOTTY;
      int result = dolly_terminal_mode_set(STDIN_FILENO, request.flags);
      if (result < 0) return result;
      response.value = result;
      break;
    }
    case DOLLY_PROCESS_TERMINAL_SIZE: {
      int descriptor = descriptor_for(process, request.descriptor);
      if (descriptor < 0) return descriptor;
      (void)descriptor;
      if (!process->terminal_descriptors[request.descriptor]) return -ENOTTY;
      response.columns = dolly_terminal_columns();
      response.rows = dolly_terminal_rows();
      break;
    }
    case DOLLY_PROCESS_TERMINAL_PUBLISH_RESULT:
      dolly_terminal_publish_result((int)request.flags);
      break;
    default:
      return -EINVAL;
  }
  memcpy(process_mailbox, &response, sizeof(response));
  return sizeof(response);
}

static void encode_display_surface(
    const dolly_display_surface *surface, uint64_t capacity,
    uint32_t buffer_index, dolly_process_display_surface_response *response) {
  *response = (dolly_process_display_surface_response){
      .generation = surface->generation,
      .capacity = capacity,
      .buffer_index = buffer_index,
      .width = surface->width,
      .height = surface->height,
      .stride = surface->stride,
      .pixel_format = surface->pixel_format,
  };
}

static int monotonic_deadline_pending(uint64_t deadline_nanoseconds) {
  if (deadline_nanoseconds == 0) return 0;
  if (deadline_nanoseconds == UINT64_MAX) return 1;
  struct timespec now;
  if (clock_gettime(CLOCK_MONOTONIC, &now) != 0) return 0;
  const uint64_t current =
      (uint64_t)now.tv_sec * UINT64_C(1000000000) + (uint64_t)now.tv_nsec;
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
        dolly_terminal_raw_ready_timeout(0)) {
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

  /* Results overwrite the mailbox, so inspect all queries before publishing
   * the response header at its beginning. Query and result records are the
   * same size and may be transformed in place from the end toward the front. */
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
  if (ready == 0 && monotonic_deadline_pending(request.deadline_nanoseconds)) {
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

static int64_t display_acquire_packet(dolly_kernel_process *process,
                                      uintptr_t request_size,
                                      uintptr_t response_capacity) {
  if (request_size != 0 ||
      response_capacity < sizeof(dolly_process_display_surface_response)) {
    return -EINVAL;
  }
  dolly_display_surface surface;
  const int result = dolly_kernel_display_acquire(process->pid, &surface);
  if (result != 0) return result;
  dolly_process_display_surface_response response;
  encode_display_surface(&surface, 0, 0, &response);
  memcpy(process_mailbox, &response, sizeof(response));
  return sizeof(response);
}

static int64_t display_set_size_packet(dolly_kernel_process *process,
                                       uintptr_t request_size,
                                       uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_size_request) ||
      response_capacity < sizeof(dolly_process_display_surface_response)) {
    return -EINVAL;
  }
  dolly_process_display_size_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  dolly_display_surface surface;
  const int result = dolly_kernel_display_set_size(
      process->pid, request.generation, request.width, request.height, &surface);
  if (result != 0) return result;
  dolly_process_display_surface_response response;
  encode_display_surface(&surface, 0, 0, &response);
  memcpy(process_mailbox, &response, sizeof(response));
  return sizeof(response);
}

static int64_t display_begin_frame_packet(dolly_kernel_process *process,
                                          uintptr_t request_size,
                                          uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_generation_request) ||
      response_capacity < sizeof(dolly_process_display_surface_response)) {
    return -EINVAL;
  }
  dolly_process_display_generation_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  dolly_display_frame frame;
  const int result = dolly_kernel_display_begin_frame(
      process->pid, request.generation, &frame);
  if (result != 0) return result;
  dolly_display_surface surface = {
      .generation = request.generation,
      .width = frame.width,
      .height = frame.height,
      .stride = frame.stride,
      .pixel_format = frame.pixel_format,
  };
  dolly_process_display_surface_response response;
  encode_display_surface(&surface, frame.capacity, frame.buffer_index, &response);
  memcpy(process_mailbox, &response, sizeof(response));
  return sizeof(response);
}

static int64_t display_write_frame_packet(dolly_kernel_process *process,
                                          uintptr_t request_size,
                                          uintptr_t response_capacity) {
  if (request_size < sizeof(dolly_process_display_write_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_process_display_write_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.reserved != 0 || request.size > SIZE_MAX ||
      request.offset > SIZE_MAX ||
      request.size != request_size - sizeof(request)) return -EINVAL;
  return dolly_kernel_display_write_frame(
      process->pid, request.generation, request.buffer_index,
      (size_t)request.offset, process_mailbox + sizeof(request),
      (size_t)request.size);
}

static int64_t display_present_packet(dolly_kernel_process *process,
                                      uintptr_t request_size,
                                      uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_present_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_process_display_present_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.reserved != 0) return -EINVAL;
  return dolly_kernel_display_present(
      process->pid, request.generation, request.buffer_index);
}

static int64_t display_wait_frame_packet(dolly_kernel_process *process,
                                         uintptr_t request_size,
                                         uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_wait_request) ||
      response_capacity < sizeof(dolly_process_display_wait_response)) {
    return -EINVAL;
  }
  dolly_process_display_wait_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.reserved != 0) return -EINVAL;
  uint32_t sequence = request.sequence;
  const int result = dolly_kernel_display_poll_frame(
      process->pid, request.generation, request.sequence, &sequence);
  if (result < 0) return result;
  if (result == 0 && monotonic_deadline_pending(request.deadline_nanoseconds)) {
    return DOLLY_PROCESS_DISPATCH_DEFERRED;
  }
  const dolly_process_display_wait_response response = {result, sequence};
  memcpy(process_mailbox, &response, sizeof(response));
  return sizeof(response);
}

static int64_t display_set_cursor_packet(dolly_kernel_process *process,
                                         uintptr_t request_size,
                                         uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_cursor_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_process_display_cursor_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.reserved != 0) return -EINVAL;
  return dolly_kernel_display_set_cursor(
      process->pid, request.generation, request.cursor);
}

static int64_t display_next_event_packet(dolly_kernel_process *process,
                                         uintptr_t request_size,
                                         uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_event_request) ||
      response_capacity < sizeof(dolly_process_display_event_response)) {
    return -EINVAL;
  }
  dolly_process_display_event_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  dolly_input_event event;
  memset(&event, 0, sizeof(event));
  const int result = dolly_kernel_display_poll_event(
      process->pid, request.generation, &event);
  if (result < 0) return result;
  if (result == 0 && monotonic_deadline_pending(request.deadline_nanoseconds)) {
    return DOLLY_PROCESS_DISPATCH_DEFERRED;
  }
  dolly_process_display_event_response response = {.result = result};
  _Static_assert(sizeof(response.event) == sizeof(event),
                 "process/display event layouts diverged");
  if (result == 1) memcpy(response.event, &event, sizeof(event));
  memcpy(process_mailbox, &response, sizeof(response));
  return sizeof(response);
}

static int64_t display_release_packet(dolly_kernel_process *process,
                                      uintptr_t request_size,
                                      uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_generation_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_process_display_generation_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  return dolly_kernel_display_release(process->pid, request.generation);
}

static int64_t http_start_packet(dolly_kernel_process *process,
                                 uintptr_t request_size,
                                 uintptr_t response_capacity) {
  if (request_size < sizeof(dolly_process_http_start_request) ||
      response_capacity < sizeof(dolly_process_http_start_response)) {
    return -EINVAL;
  }
  if (process->http_sequence != 0) return -EBUSY;
  dolly_process_http_start_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.method_size == 0 || request.url_size == 0 ||
      request.body_size > SIZE_MAX) return -EINVAL;
  const size_t method_size = request.method_size;
  const size_t url_size = request.url_size;
  const size_t headers_size = request.headers_size;
  const size_t body_size = (size_t)request.body_size;
  size_t remaining = (size_t)request_size - sizeof(request);
  if (method_size > remaining) return -EINVAL;
  remaining -= method_size;
  if (url_size > remaining) return -EINVAL;
  remaining -= url_size;
  if (headers_size > remaining) return -EINVAL;
  remaining -= headers_size;
  if (body_size != remaining ||
      method_size > SIZE_MAX - url_size - headers_size - 3) return -EINVAL;

  const unsigned char *cursor = process_mailbox + sizeof(request);
  if (memchr(cursor, 0, method_size) != NULL ||
      memchr(cursor + method_size, 0, url_size) != NULL ||
      memchr(cursor + method_size + url_size, 0, headers_size) != NULL) {
    return -EINVAL;
  }
  char *strings = malloc(method_size + url_size + headers_size + 3);
  if (strings == NULL) return -ENOMEM;
  char *method = strings;
  char *url = method + method_size + 1;
  char *headers = url + url_size + 1;
  memcpy(method, cursor, method_size);
  method[method_size] = 0;
  cursor += method_size;
  memcpy(url, cursor, url_size);
  url[url_size] = 0;
  cursor += url_size;
  memcpy(headers, cursor, headers_size);
  headers[headers_size] = 0;
  cursor += headers_size;

  unsigned int sequence = 0;
  const int result = dolly_http_start(
      method, url, headers, cursor, body_size, request.flags, &sequence);
  free(strings);
  if (result != 0) return result;
  process->http_sequence = sequence;
  const dolly_process_http_start_response response = {sequence, 0};
  memcpy(process_mailbox, &response, sizeof(response));
  return sizeof(response);
}

static int64_t http_poll_packet(dolly_kernel_process *process,
                                uintptr_t request_size,
                                uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_http_poll_request) ||
      response_capacity < sizeof(dolly_process_http_poll_response)) {
    return -EINVAL;
  }
  dolly_process_http_poll_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.reserved != 0 || request.sequence == 0 ||
      request.sequence != process->http_sequence) return -ESTALE;
  dolly_http_chunk chunk = {0};
  const size_t data_capacity =
      (size_t)response_capacity - sizeof(dolly_process_http_poll_response);
  const int result = dolly_http_poll(
      request.sequence, &chunk,
      process_mailbox + sizeof(dolly_process_http_poll_response),
      data_capacity);
  if (result == 0) return DOLLY_PROCESS_DISPATCH_DEFERRED;
  if (result < 0) return result;
  if (chunk.length > data_capacity) return -EOVERFLOW;
  const dolly_process_http_poll_response response = {
      1, chunk.status, chunk.kind, chunk.error, chunk.eof, 0, chunk.length,
  };
  memcpy(process_mailbox, &response, sizeof(response));
  if (chunk.eof) process->http_sequence = 0;
  return (int64_t)(sizeof(response) + chunk.length);
}

static int64_t http_cancel_packet(dolly_kernel_process *process,
                                  uintptr_t request_size,
                                  uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_http_cancel_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_process_http_cancel_request request;
  memcpy(&request, process_mailbox, sizeof(request));
  if (request.reserved != 0 || request.sequence == 0 ||
      request.sequence != process->http_sequence) return -ESTALE;
  const int result = dolly_http_cancel(request.sequence);
  if (result == 0) process->http_sequence = 0;
  return result;
}

EMSCRIPTEN_KEEPALIVE
uint32_t dolly_process_supervisor_version(void) { return 0; }

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_process_mailbox_address(void) {
  return (uintptr_t)process_mailbox;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_process_mailbox_capacity(void) {
  return sizeof(process_mailbox);
}

EMSCRIPTEN_KEEPALIVE
int dolly_process_spawn_serialized(uintptr_t request_size) {
  return spawn_packet(0, (size_t)request_size);
}

EMSCRIPTEN_KEEPALIVE
int64_t dolly_process_dispatch(int pid, uint32_t operation,
                               uintptr_t request_size,
                               uintptr_t response_capacity) {
  if (request_size > sizeof(process_mailbox) ||
      response_capacity > sizeof(process_mailbox)) return -E2BIG;
  dolly_kernel_process *process = find_process(pid);
  if (process == NULL) return -ESRCH;
  if (process->state != DOLLY_KERNEL_PROCESS_RUNNING &&
      operation != DOLLY_PROCESS_EXIT) return -ESRCH;

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
      if (request_size != sizeof(dolly_process_fd_request)) return -EINVAL;
      dolly_process_fd_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.reserved != 0) return -EINVAL;
      if (!descriptor_is_open(process, request.descriptor)) return -EBADF;
      release_descriptor(process, request.descriptor);
      return 0;
    }
    case DOLLY_PROCESS_FD_SEEK: {
      if (request_size != sizeof(dolly_process_fd_seek_request) ||
          response_capacity < sizeof(dolly_process_fd_seek_response)) return -EINVAL;
      dolly_process_fd_seek_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      int descriptor = descriptor_for(process, request.descriptor);
      if (descriptor < 0) return descriptor;
      if (request.whence > 2) return -EINVAL;
      off_t offset = lseek(descriptor, (off_t)request.offset, (int)request.whence);
      if (offset < 0) return -errno;
      dolly_process_fd_seek_response response = {(uint64_t)offset};
      memcpy(process_mailbox, &response, sizeof(response));
      return sizeof(response);
    }
    case DOLLY_PROCESS_FD_SYNC: {
      if (request_size != sizeof(dolly_process_fd_request)) return -EINVAL;
      dolly_process_fd_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.reserved != 0) return -EINVAL;
      int descriptor = descriptor_for(process, request.descriptor);
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
      if (request_size != sizeof(dolly_process_fd_request) ||
          response_capacity < sizeof(dolly_process_filesystem_stat_response)) {
        return -EINVAL;
      }
      dolly_process_fd_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.reserved != 0) return -EINVAL;
      int descriptor = descriptor_for(process, request.descriptor);
      if (descriptor < 0) return descriptor;
      struct stat metadata;
      if (fstat(descriptor, &metadata) != 0) return -errno;
      dolly_process_filesystem_stat_response response;
      encode_filesystem_stat(metadata.st_ino, &response);
      memcpy(process_mailbox, &response, sizeof(response));
      return sizeof(response);
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
      if ((request.flags & ~DOLLY_PROCESS_FD_DUP_MINIMUM) != 0 ||
          request.reserved != 0) return -EINVAL;
      if (!descriptor_is_open(process, request.source_descriptor)) return -EBADF;
      const int minimum = (request.flags & DOLLY_PROCESS_FD_DUP_MINIMUM) != 0;
      if ((!minimum && request.target_descriptor == request.source_descriptor) ||
          (minimum && request.target_descriptor >= DOLLY_KERNEL_DESCRIPTOR_LIMIT)) {
        return -EINVAL;
      }
      const int terminal =
          process->terminal_descriptors[request.source_descriptor];
      dolly_kernel_pipe *pipe = process->pipes[request.source_descriptor];
      const unsigned pipe_direction =
          process->pipe_directions[request.source_descriptor];
      int target;
      if (pipe != NULL) {
        if (minimum) {
          target = allocate_pipe_descriptor_at_least(
              process, pipe, pipe_direction, request.target_descriptor);
        } else if (request.target_descriptor == UINT32_MAX) {
          target = allocate_pipe_descriptor(process, pipe, pipe_direction);
        } else if (request.target_descriptor >= DOLLY_KERNEL_DESCRIPTOR_LIMIT) {
          return -EBADF;
        } else {
          target = (int)request.target_descriptor;
          release_descriptor(process, (uint32_t)target);
          process->pipes[target] = pipe;
          process->pipe_directions[target] = (unsigned char)pipe_direction;
          retain_pipe(pipe, pipe_direction);
        }
        if (target < 0) return target;
        dolly_process_fd_dup_response response = {(uint32_t)target, 0};
        memcpy(process_mailbox, &response, sizeof(response));
        return sizeof(response);
      }
      int source = descriptor_for(process, request.source_descriptor);
      if (source < 0) return source;
      int duplicate = dup(source);
      if (duplicate < 0) return -errno;
      if (minimum) {
        target = allocate_descriptor_at_least(
            process, duplicate, terminal, request.target_descriptor);
        if (target < 0) close(duplicate);
      } else if (request.target_descriptor == UINT32_MAX) {
        target = allocate_descriptor(process, duplicate, terminal);
        if (target < 0) close(duplicate);
      } else if (request.target_descriptor >= DOLLY_KERNEL_DESCRIPTOR_LIMIT) {
        close(duplicate);
        return -EBADF;
      } else {
        target = (int)request.target_descriptor;
        release_descriptor(process, (uint32_t)target);
        process->descriptors[target] = duplicate;
        process->terminal_descriptors[target] = terminal;
      }
      if (target < 0) return target;
      dolly_process_fd_dup_response response = {(uint32_t)target, 0};
      memcpy(process_mailbox, &response, sizeof(response));
      return sizeof(response);
    }
    case DOLLY_PROCESS_FD_GET_FLAGS: {
      if (request_size != sizeof(dolly_process_fd_request) ||
          response_capacity < sizeof(dolly_process_fd_flags)) return -EINVAL;
      dolly_process_fd_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.reserved != 0) return -EINVAL;
      if (!descriptor_is_open(process, request.descriptor)) return -EBADF;
      int flags;
      if (process->pipes[request.descriptor] != NULL) {
        flags = process->pipe_directions[request.descriptor] ==
                DOLLY_KERNEL_PIPE_READ ? O_RDONLY : O_WRONLY;
      } else {
        const int descriptor = descriptor_for(process, request.descriptor);
        if (descriptor < 0) return descriptor;
        flags = fcntl(descriptor, F_GETFL);
        if (flags < 0) return -errno;
      }
      dolly_process_fd_flags response = {
          request.descriptor, (uint32_t)flags,
      };
      memcpy(process_mailbox, &response, sizeof(response));
      return sizeof(response);
    }
    case DOLLY_PROCESS_FD_SET_FLAGS: {
      if (request_size != sizeof(dolly_process_fd_flags) ||
          response_capacity != 0) return -EINVAL;
      dolly_process_fd_flags request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (!descriptor_is_open(process, request.descriptor)) return -EBADF;
      if (process->pipes[request.descriptor] != NULL) {
        return (request.flags & (O_APPEND | O_NONBLOCK | O_ASYNC)) == 0
            ? 0 : -ENOTSUP;
      }
      const int descriptor = descriptor_for(process, request.descriptor);
      if (descriptor < 0) return descriptor;
      return fcntl(descriptor, F_SETFL, (int)request.flags) == 0 ? 0 : -errno;
    }
    case DOLLY_PROCESS_FD_PIPE: {
      if (request_size != 0 ||
          response_capacity < sizeof(dolly_process_pipe_response)) return -EINVAL;
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
      dolly_process_pipe_response response = {
          (uint32_t)read_descriptor, (uint32_t)write_descriptor,
      };
      memcpy(process_mailbox, &response, sizeof(response));
      return sizeof(response);
    }
    case DOLLY_PROCESS_FD_READ_DIRECTORY:
      return fd_read_directory_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_FD_STAT: {
      if (request_size != sizeof(dolly_process_fd_request) ||
          response_capacity < sizeof(dolly_process_stat_response)) return -EINVAL;
      dolly_process_fd_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.reserved != 0) return -EINVAL;
      if (request.descriptor < DOLLY_KERNEL_DESCRIPTOR_LIMIT &&
          process->pipes[request.descriptor] != NULL) {
        dolly_process_stat_response response;
        memset(&response, 0, sizeof(response));
        response.mode = S_IFIFO | 0600;
        response.link_count = 1;
        response.block_size = 4096;
        response.file_type = DOLLY_PROCESS_FILE_FIFO;
        memcpy(process_mailbox, &response, sizeof(response));
        return sizeof(response);
      }
      int descriptor = descriptor_for(process, request.descriptor);
      if (descriptor < 0) return descriptor;
      struct stat metadata;
      if (fstat(descriptor, &metadata) != 0) return -errno;
      dolly_process_stat_response response;
      encode_stat(&metadata, &response);
      memcpy(process_mailbox, &response, sizeof(response));
      return sizeof(response);
    }
    case DOLLY_PROCESS_PATH_OPEN: {
      if (response_capacity < sizeof(dolly_process_path_open_response)) return -ENOBUFS;
      dolly_process_path_request request;
      char *path = NULL;
      int directory = AT_FDCWD;
      int result = decode_path_request(process, request_size, &request,
                                       &path, &directory);
      int flags = result == 0 ? open_flags(request.flags) : result;
      if (flags < 0) result = flags;
      int kernel_fd = -1;
      if (result == 0) {
        kernel_fd = openat(directory, path, flags, 0666);
        if (kernel_fd < 0) result = -errno;
      }
      int guest_fd = -1;
      if (result == 0) {
        guest_fd = allocate_descriptor(process, kernel_fd, 0);
        if (guest_fd < 0) {
          close(kernel_fd);
          result = guest_fd;
        }
      }
      free(path);
      if (result != 0) return result;
      dolly_process_path_open_response response = {(uint32_t)guest_fd, 0};
      memcpy(process_mailbox, &response, sizeof(response));
      return sizeof(response);
    }
    case DOLLY_PROCESS_PATH_STAT: {
      if (response_capacity < sizeof(dolly_process_stat_response)) return -ENOBUFS;
      dolly_process_path_request request;
      char *path = NULL;
      int directory = AT_FDCWD;
      int result = decode_path_request(process, request_size, &request,
                                       &path, &directory);
      struct stat metadata;
      if (result == 0 &&
          fstatat(directory, path, &metadata,
                  (request.flags & DOLLY_PROCESS_PATH_NOFOLLOW) != 0
                      ? AT_SYMLINK_NOFOLLOW : 0) != 0) result = -errno;
      free(path);
      if (result != 0) return result;
      dolly_process_stat_response response;
      encode_stat(&metadata, &response);
      memcpy(process_mailbox, &response, sizeof(response));
      return sizeof(response);
    }
    case DOLLY_PROCESS_PATH_CREATE_DIRECTORY: {
      dolly_process_path_request request;
      char *path = NULL;
      int directory = AT_FDCWD;
      int result = decode_path_request(process, request_size, &request,
                                       &path, &directory);
      if (result == 0 && request.flags != 0) result = -EINVAL;
      if (result == 0 && mkdirat(directory, path, 0777) != 0) result = -errno;
      free(path);
      return result;
    }
    case DOLLY_PROCESS_PATH_REMOVE: {
      dolly_process_path_request request;
      char *path = NULL;
      int directory = AT_FDCWD;
      int result = decode_path_request(process, request_size, &request,
                                       &path, &directory);
      if (result == 0 &&
          (request.flags & ~DOLLY_PROCESS_PATH_DIRECTORY) != 0) result = -EINVAL;
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
      if (request_size < sizeof(dolly_process_two_path_request)) return -EINVAL;
      dolly_process_two_path_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.old_path_size == 0 || request.new_path_size == 0 ||
          request.old_path_size > request_size - sizeof(request) ||
          request.new_path_size != request_size - sizeof(request) - request.old_path_size) {
        return -EINVAL;
      }
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
      if (request_size < sizeof(dolly_process_two_path_request)) return -EINVAL;
      dolly_process_two_path_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.old_directory_descriptor != UINT32_MAX ||
          request.old_path_size == 0 || request.new_path_size == 0 ||
          request.old_path_size > request_size - sizeof(request) ||
          request.new_path_size != request_size - sizeof(request) - request.old_path_size) {
        return -EINVAL;
      }
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
      int result = decode_path_request(process, request_size, &request,
                                       &path, &directory);
      if (result == 0 && request.flags != 0) result = -EINVAL;
      if (result == 0) {
        ssize_t count = readlinkat(directory, path, (char *)process_mailbox,
                                   response_capacity);
        result = count < 0 ? -errno : (int)count;
      }
      free(path);
      return result;
    }
    case DOLLY_PROCESS_PATH_GET_CURRENT_DIRECTORY: {
      if (request_size != 0) return -EINVAL;
      const size_t size = strlen(process->current_directory) + 1;
      if (size > response_capacity) return -ENOBUFS;
      memcpy(process_mailbox, process->current_directory, size);
      return (int64_t)size;
    }
    case DOLLY_PROCESS_PATH_SET_CURRENT_DIRECTORY: {
      dolly_process_path_request request;
      char *path = NULL;
      int directory = AT_FDCWD;
      int result = decode_path_request(process, request_size, &request,
                                       &path, &directory);
      if (result == 0 && (request.flags != 0 || directory != AT_FDCWD)) {
        result = -EINVAL;
      }
      struct stat metadata;
      if (result == 0 && stat(path, &metadata) != 0) result = -errno;
      if (result == 0 && !S_ISDIR(metadata.st_mode)) result = -ENOTDIR;
      char *canonical = NULL;
      if (result == 0) {
        canonical = realpath(path, NULL);
        if (canonical == NULL) result = -errno;
      }
      free(path);
      if (result != 0) {
        free(canonical);
        return result;
      }
      free(process->current_directory);
      process->current_directory = canonical;
      return 0;
    }
    case DOLLY_PROCESS_PATH_STAT_FILESYSTEM: {
      if (response_capacity < sizeof(dolly_process_filesystem_stat_response)) {
        return -ENOBUFS;
      }
      dolly_process_path_request request;
      char *path = NULL;
      int directory = AT_FDCWD;
      int result = decode_path_request(
          process, request_size, &request, &path, &directory);
      if (result == 0 && request.flags != 0) result = -EINVAL;
      struct stat metadata;
      if (result == 0 && fstatat(directory, path, &metadata, 0) != 0) {
        result = -errno;
      }
      free(path);
      if (result != 0) return result;
      dolly_process_filesystem_stat_response response;
      encode_filesystem_stat(metadata.st_ino, &response);
      memcpy(process_mailbox, &response, sizeof(response));
      return sizeof(response);
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
      memcpy(process_mailbox, &response, sizeof(response));
      return sizeof(response);
    }
    case DOLLY_PROCESS_WAIT: {
      if (request_size != sizeof(dolly_process_wait_request) ||
          response_capacity < sizeof(dolly_process_wait_response)) return -EINVAL;
      dolly_process_wait_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.flags != 0) return -EINVAL;
      dolly_kernel_process *child = find_process((int)request.pid);
      if (child == NULL || child->parent_pid != pid) return -ECHILD;
      if (child->state != DOLLY_KERNEL_PROCESS_EXITED) {
        return DOLLY_PROCESS_DISPATCH_DEFERRED;
      }
      dolly_process_wait_response response = {(uint32_t)child->status, 0};
      dispose_process(child);
      memcpy(process_mailbox, &response, sizeof(response));
      return sizeof(response);
    }
    case DOLLY_PROCESS_INTERRUPT_POLL: {
      if (request_size != 0 || response_capacity < sizeof(int32_t)) return -EINVAL;
      const int32_t response = process->pending_signal;
      process->pending_signal = 0;
      memcpy(process_mailbox, &response, sizeof(response));
      return sizeof(response);
    }
    case DOLLY_PROCESS_TERMINAL:
      return terminal_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_DOWNLOAD_FILE: {
      dolly_process_path_request request;
      char *path = NULL;
      int directory = AT_FDCWD;
      int result = decode_path_request(process, request_size, &request,
                                       &path, &directory);
      if (result == 0 && (request.flags != 0 || directory != AT_FDCWD)) {
        result = -EINVAL;
      }
      if (result == 0) result = dolly_download_file(path);
      free(path);
      return result;
    }
    case DOLLY_PROCESS_CLOCK_TIME: {
      if (request_size != sizeof(dolly_process_clock_request) ||
          response_capacity < sizeof(dolly_process_clock_response)) return -EINVAL;
      dolly_process_clock_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.reserved != 0 || request.clock_id > 1) return -EINVAL;
      struct timespec value;
      const clockid_t clock = request.clock_id == 0 ? CLOCK_REALTIME : CLOCK_MONOTONIC;
      if (clock_gettime(clock, &value) != 0) return -errno;
      dolly_process_clock_response response = {
          (uint64_t)value.tv_sec * 1000000000u + (uint64_t)value.tv_nsec,
      };
      memcpy(process_mailbox, &response, sizeof(response));
      return sizeof(response);
    }
    case DOLLY_PROCESS_CLOCK_RESOLUTION: {
      if (request_size != sizeof(dolly_process_clock_request) ||
          response_capacity < sizeof(dolly_process_clock_response)) return -EINVAL;
      dolly_process_clock_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.reserved != 0 || request.clock_id > 1 ||
          request.precision_nanoseconds != 0) return -EINVAL;
      struct timespec value;
      const clockid_t clock = request.clock_id == 0 ? CLOCK_REALTIME : CLOCK_MONOTONIC;
      if (clock_getres(clock, &value) != 0) return -errno;
      dolly_process_clock_response response = {
          (uint64_t)value.tv_sec * 1000000000u + (uint64_t)value.tv_nsec,
      };
      memcpy(process_mailbox, &response, sizeof(response));
      return sizeof(response);
    }
    case DOLLY_PROCESS_CLOCK_SLEEP: {
      if (request_size != sizeof(dolly_process_clock_sleep_request) ||
          response_capacity != 0) return -EINVAL;
      dolly_process_clock_sleep_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.flags != 0 || request.clock_id > 1) return -EINVAL;
      struct timespec value;
      const clockid_t clock = request.clock_id == 0
          ? CLOCK_REALTIME : CLOCK_MONOTONIC;
      if (clock_gettime(clock, &value) != 0) return -errno;
      const uint64_t now =
          (uint64_t)value.tv_sec * 1000000000u + (uint64_t)value.tv_nsec;
      return now >= request.deadline_nanoseconds
          ? 0 : DOLLY_PROCESS_DISPATCH_DEFERRED;
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
    case DOLLY_PROCESS_DISPLAY_ACQUIRE:
      return display_acquire_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_SET_SIZE:
      return display_set_size_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_BEGIN_FRAME:
      return display_begin_frame_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_WRITE_FRAME:
      return display_write_frame_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_PRESENT:
      return display_present_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_WAIT_FRAME:
      return display_wait_frame_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_SET_CURSOR:
      return display_set_cursor_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_NEXT_EVENT:
      return display_next_event_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_RELEASE:
      return display_release_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_HTTP_START:
      return http_start_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_HTTP_POLL:
      return http_poll_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_HTTP_CANCEL:
      return http_cancel_packet(process, request_size, response_capacity);
    case DOLLY_PROCESS_EXIT: {
      if (request_size != sizeof(dolly_process_exit_request)) return -EINVAL;
      dolly_process_exit_request request;
      memcpy(&request, process_mailbox, sizeof(request));
      if (request.reserved != 0 || request.status > 255) return -EINVAL;
      /* Waking a blocking operation with EINTR must not let an otherwise
       * signal-unaware program turn Ctrl-C into an arbitrary failure status.
       * A runtime that deliberately handles SIGINT acknowledges it through
       * DOLLY_PROCESS_INTERRUPT_POLL, which clears pending_signal. */
      const int status = process->pending_signal == SIGINT
          ? 128 + SIGINT : (int)request.status;
      mark_process_exited(process, status);
      return 0;
    }
    default:
      return -ENOSYS;
  }
}

EMSCRIPTEN_KEEPALIVE
int dolly_process_next_launch(void) {
  for (size_t index = 0; index < DOLLY_KERNEL_PROCESS_LIMIT; ++index) {
    if (process_table[index].state == DOLLY_KERNEL_PROCESS_PENDING &&
        process_table[index].image != NULL) return process_table[index].pid;
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_process_image_address(int pid) {
  dolly_kernel_process *process = find_process(pid);
  return process != NULL && process->state == DOLLY_KERNEL_PROCESS_PENDING
      ? (uintptr_t)process->image : 0;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_process_image_size(int pid) {
  dolly_kernel_process *process = find_process(pid);
  return process != NULL && process->state == DOLLY_KERNEL_PROCESS_PENDING
      ? process->image_size : 0;
}

EMSCRIPTEN_KEEPALIVE
int dolly_process_image_consumed(int pid) {
  dolly_kernel_process *process = find_process(pid);
  if (process == NULL || process->state != DOLLY_KERNEL_PROCESS_PENDING ||
      process->image == NULL) return -EINVAL;
  free(process->image);
  process->image = NULL;
  process->image_size = 0;
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int dolly_process_worker_started(int pid) {
  dolly_kernel_process *process = find_process(pid);
  if (process == NULL || process->state != DOLLY_KERNEL_PROCESS_PENDING ||
      process->image != NULL) return -EINVAL;
  process->state = DOLLY_KERNEL_PROCESS_RUNNING;
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int dolly_process_worker_failed(int pid, int status) {
  dolly_kernel_process *process = find_process(pid);
  if (process == NULL || process->state == DOLLY_KERNEL_PROCESS_EXITED) return -EINVAL;
  mark_process_exited(process, status);
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int dolly_process_signal(int pid, int signal_number) {
  dolly_kernel_process *process = find_process(pid);
  if (process == NULL || process->state == DOLLY_KERNEL_PROCESS_EXITED) {
    return -ESRCH;
  }
  if (signal_number != SIGINT) return -EINVAL;
  process->pending_signal = signal_number;
  return 0;
}

EMSCRIPTEN_KEEPALIVE
double dolly_process_deadline_remaining(int pid) {
  dolly_kernel_process *process = find_process(pid);
  if (process == NULL || process->state == DOLLY_KERNEL_PROCESS_EXITED) return -2;
  if (process->deadline_nanoseconds == UINT64_MAX) return -1;
  struct timespec value;
  if (clock_gettime(CLOCK_MONOTONIC, &value) != 0) return 0;
  const uint64_t now =
      (uint64_t)value.tv_sec * 1000000000u + (uint64_t)value.tv_nsec;
  if (now >= process->deadline_nanoseconds) return 0;
  return (double)(process->deadline_nanoseconds - now) / 1000000.0;
}

EMSCRIPTEN_KEEPALIVE
int dolly_process_collect(int pid) {
  dolly_kernel_process *process = find_process(pid);
  if (process == NULL) return -ESRCH;
  if (process->state != DOLLY_KERNEL_PROCESS_EXITED) return -EAGAIN;
  const int status = process->status;
  dispose_process(process);
  return status;
}

EMSCRIPTEN_KEEPALIVE
int dolly_process_parent(int pid) {
  dolly_kernel_process *process = find_process(pid);
  return process == NULL ? -ESRCH : process->parent_pid;
}
