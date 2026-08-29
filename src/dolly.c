#include <errno.h>
#include <dlfcn.h>
#include <fcntl.h>
#include <netdb.h>
#include <setjmp.h>
#include <signal.h>
#include <stdarg.h>
#include <stddef.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <unistd.h>

#include <emscripten/atomic.h>
#include <emscripten/emscripten.h>
#include <emscripten/wasmfs.h>

#include <dolly/http.h>

#include "dolly-runtime.h"

extern char **environ;

typedef int (*dolly_program_entry)(int argc, char **argv);

enum {
  DOLLY_MAX_EXIT_DEPTH = 32,
  DOLLY_MAX_EXIT_CALLBACKS = 64,
  DOLLY_MAX_MODULE_IMAGES = 128,
};

// Emscripten's wasm64 dlopen handle records the relocated static-memory range.
// Its loader intentionally keeps module instances resident after dlclose, so
// Dolly snapshots that range after first-load initialization and restores it
// before every later command entry. This is the version-pinned implementation
// detail behind process-like zero-initialized globals in a shared address space.
typedef struct {
  void *event;
  int flags;
  uint8_t memory_allocated;
  void *memory_address;
  size_t memory_size;
  void *table_address;
  size_t table_size;
  uint8_t *file_data;
  size_t file_data_size;
  char name[];
} dolly_dso_handle;

_Static_assert(offsetof(dolly_dso_handle, memory_address) == 16,
               "Emscripten wasm64 DSO layout changed");
_Static_assert(offsetof(dolly_dso_handle, name) == 64,
               "Emscripten wasm64 DSO layout changed");

typedef struct {
  char *path;
  void *address;
  size_t size;
  unsigned char *initial;
} dolly_module_image;

static dolly_module_image module_images[DOLLY_MAX_MODULE_IMAGES];

static int prepare_module_image(const char *path, void *module) {
  dolly_dso_handle *handle = module;
  if (!handle->memory_allocated || handle->memory_size == 0) return 0;

  for (size_t index = 0; index < DOLLY_MAX_MODULE_IMAGES; index++) {
    dolly_module_image *image = &module_images[index];
    if (image->path == NULL) {
      size_t path_size = strlen(path) + 1;
      image->path = malloc(path_size);
      image->initial = malloc(handle->memory_size);
      if (image->path == NULL || image->initial == NULL) {
        free(image->path);
        free(image->initial);
        memset(image, 0, sizeof(*image));
        return -1;
      }
      memcpy(image->path, path, path_size);
      image->address = handle->memory_address;
      image->size = handle->memory_size;
      memcpy(image->initial, image->address, image->size);
      return 0;
    }
    if (strcmp(image->path, path) == 0) {
      if (image->address != handle->memory_address ||
          image->size != handle->memory_size) {
        return -1;
      }
      memcpy(image->address, image->initial, image->size);
      return 0;
    }
  }
  return -1;
}

typedef struct {
  jmp_buf environment;
  int status;
  void (*callbacks[DOLLY_MAX_EXIT_CALLBACKS])(void);
  size_t callback_count;
} dolly_exit_frame;

static dolly_exit_frame exit_frames[DOLLY_MAX_EXIT_DEPTH];
static size_t exit_depth;

typedef struct {
  _Atomic uint32_t input_read;
  _Atomic uint32_t input_write;
  _Atomic uint32_t input_wake;
  _Atomic uint32_t result_sequence;
  _Atomic uint32_t result_status;
  _Atomic uint32_t foreground_pid;
  _Atomic uint32_t flags;
  unsigned char reserved[DOLLY_TERMINAL_MAILBOX_HEADER_SIZE - 7 * sizeof(uint32_t)];
  unsigned char input[DOLLY_TERMINAL_INPUT_CAPACITY];
} dolly_terminal_mailbox;

_Static_assert(offsetof(dolly_terminal_mailbox, input) == DOLLY_TERMINAL_MAILBOX_HEADER_SIZE,
               "terminal mailbox layout changed");
_Static_assert((DOLLY_TERMINAL_INPUT_CAPACITY & (DOLLY_TERMINAL_INPUT_CAPACITY - 1)) == 0,
               "terminal input capacity must be a power of two");

_Alignas(64) static dolly_terminal_mailbox terminal_mailbox;

typedef struct {
  _Atomic uint32_t state;
  _Atomic uint32_t sequence;
  _Atomic uint32_t status;
  _Atomic uint32_t length;
  _Atomic uint32_t eof;
  _Atomic uint32_t error;
  _Atomic uint32_t kind;
  unsigned char reserved[DOLLY_HTTP_MAILBOX_HEADER_SIZE - 7 * sizeof(uint32_t)];
  unsigned char data[DOLLY_HTTP_CHUNK_CAPACITY];
} dolly_http_mailbox;

_Static_assert(offsetof(dolly_http_mailbox, data) == DOLLY_HTTP_MAILBOX_HEADER_SIZE,
               "HTTP mailbox layout changed");

_Alignas(64) static dolly_http_mailbox http_mailbox;

static unsigned char cooked_line[4096];
static size_t cooked_length;
static size_t cooked_cursor;
static int cooked_boundary;

EM_JS(void, dolly_terminal_write, (const char *text), {
  Module["terminalWrite"]?.(UTF8ToString(Number(text)));
});

EM_JS(void, dolly_terminal_write_bytes,
      (const unsigned char *bytes, uintptr_t length), {
  const start = Number(bytes);
  Module["terminalWriteBytes"]?.(HEAPU8.slice(start, start + Number(length)));
});

EM_JS(void, dolly_http_dispatch,
      (const char *method, const char *url, const char *headers,
       const void *body, uintptr_t body_size, uint32_t flags,
       uint32_t sequence), {
  const start = Number(body);
  Module["httpDispatch"]?.({
    method: UTF8ToString(Number(method)),
    url: UTF8ToString(Number(url)),
    headers: headers ? UTF8ToString(Number(headers)) : "",
    body: body_size ? HEAPU8.slice(start, start + Number(body_size)) : null,
    flags,
    sequence,
  });
});

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_terminal_mailbox_address(void) {
  return (uintptr_t)&terminal_mailbox;
}

EMSCRIPTEN_KEEPALIVE
uint32_t dolly_terminal_mailbox_version(void) {
  return DOLLY_TERMINAL_MAILBOX_VERSION;
}

EMSCRIPTEN_KEEPALIVE
uint32_t dolly_terminal_input_capacity(void) {
  return DOLLY_TERMINAL_INPUT_CAPACITY;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_http_mailbox_address(void) {
  return (uintptr_t)&http_mailbox;
}

EMSCRIPTEN_KEEPALIVE
uint32_t dolly_http_mailbox_version(void) {
  return DOLLY_HTTP_MAILBOX_VERSION;
}

EMSCRIPTEN_KEEPALIVE
uint32_t dolly_http_chunk_capacity(void) {
  return DOLLY_HTTP_CHUNK_CAPACITY;
}

static int append_http_text(char **target, size_t *length,
                            const unsigned char *bytes, size_t count) {
  if (count > SIZE_MAX - *length - 1) return -EOVERFLOW;
  char *grown = realloc(*target, *length + count + 1);
  if (grown == NULL) return -ENOMEM;
  memcpy(grown + *length, bytes, count);
  *length += count;
  grown[*length] = '\0';
  *target = grown;
  return 0;
}

void dolly_http_response_dispose(dolly_http_response *response) {
  if (response == NULL) return;
  free(response->effective_url);
  response->effective_url = NULL;
  response->status = 0;
}

int dolly_http_perform(const dolly_http_request *request,
                       dolly_http_response *response) {
  const unsigned int valid_flags =
      DOLLY_HTTP_FAIL_STATUS | DOLLY_HTTP_FOLLOW_REDIRECTS;
  if (request == NULL || response == NULL || request->method == NULL ||
      request->url == NULL || request->method[0] == '\0' ||
      request->url[0] == '\0' || (request->flags & ~valid_flags) != 0 ||
      (request->body_size != 0 && request->body == NULL)) return -EINVAL;

  response->status = 0;
  response->effective_url = NULL;
  size_t effective_url_length = 0;

  uint32_t expected = 0;
  if (!atomic_compare_exchange_strong_explicit(
          &http_mailbox.state, &expected, 1,
          memory_order_acq_rel, memory_order_acquire)) return -EBUSY;

  uint32_t sequence = atomic_fetch_add_explicit(
      &http_mailbox.sequence, 1, memory_order_acq_rel) + 1;
  atomic_store_explicit(&http_mailbox.status, 0, memory_order_relaxed);
  atomic_store_explicit(&http_mailbox.length, 0, memory_order_relaxed);
  atomic_store_explicit(&http_mailbox.eof, 0, memory_order_relaxed);
  atomic_store_explicit(&http_mailbox.error, 0, memory_order_relaxed);
  atomic_store_explicit(&http_mailbox.kind, 0, memory_order_relaxed);
  atomic_store_explicit(&http_mailbox.state, 1, memory_order_release);
  dolly_http_dispatch(request->method, request->url, request->headers,
                      request->body, request->body_size, request->flags,
                      sequence);

  int result = 0;
  for (;;) {
    uint32_t state;
    while ((state = atomic_load_explicit(
                &http_mailbox.state, memory_order_acquire)) != 2) {
      emscripten_atomic_wait_u32((void *)&http_mailbox.state, state,
                                 ATOMICS_WAIT_DURATION_INFINITE);
    }

    uint32_t status = atomic_load_explicit(&http_mailbox.status,
                                           memory_order_relaxed);
    uint32_t length = atomic_load_explicit(&http_mailbox.length,
                                           memory_order_relaxed);
    uint32_t eof = atomic_load_explicit(&http_mailbox.eof,
                                        memory_order_relaxed);
    uint32_t error = atomic_load_explicit(&http_mailbox.error,
                                          memory_order_relaxed);
    uint32_t kind = atomic_load_explicit(&http_mailbox.kind,
                                         memory_order_relaxed);
    response->status = status;
    if (error != 0 && result == 0) {
      result = error == 2 ? -EACCES :
               error == 3 ? -EPROTONOSUPPORT : -EIO;
    }
    if ((request->flags & DOLLY_HTTP_FAIL_STATUS) != 0 &&
        status >= 400 && result == 0) {
      result = (int)status;
    }
    if (length > DOLLY_HTTP_CHUNK_CAPACITY && result == 0) result = -EOVERFLOW;

    if (result == 0 && kind == 1) {
      result = append_http_text(&response->effective_url,
                                &effective_url_length,
                                http_mailbox.data, length);
    } else if (result == 0 && kind == 2 && request->header != NULL) {
      if (request->header(http_mailbox.data, length,
                          request->header_context) != length) {
        result = -ECANCELED;
      }
    } else if (result == 0 && kind == 3 && request->write != NULL) {
      if (request->write(http_mailbox.data, length,
                         request->write_context) != length) {
        result = -ECANCELED;
      }
    }

    atomic_store_explicit(&http_mailbox.state, eof ? 0 : 1,
                          memory_order_release);
    emscripten_atomic_notify((void *)&http_mailbox.state,
                             EMSCRIPTEN_NOTIFY_ALL_WAITERS);
    if (eof) break;
  }
  if (result != 0) dolly_http_response_dispose(response);
  return result;
}

int dolly_terminal_read_raw(void) {
  for (;;) {
    uint32_t read = atomic_load_explicit(&terminal_mailbox.input_read, memory_order_relaxed);
    uint32_t write = atomic_load_explicit(&terminal_mailbox.input_write, memory_order_acquire);
    if (read != write) {
      int byte = terminal_mailbox.input[read & (DOLLY_TERMINAL_INPUT_CAPACITY - 1)];
      atomic_store_explicit(&terminal_mailbox.input_read, read + 1, memory_order_release);
      return byte;
    }

    uint32_t wake = atomic_load_explicit(&terminal_mailbox.input_wake, memory_order_acquire);
    if (atomic_load_explicit(&terminal_mailbox.input_write, memory_order_acquire) == read) {
      emscripten_atomic_wait_u32((void *)&terminal_mailbox.input_wake, wake,
                                 ATOMICS_WAIT_DURATION_INFINITE);
    }
  }
}

void dolly_terminal_reset_cooked(void) {
  cooked_length = 0;
  cooked_cursor = 0;
  cooked_boundary = 0;
  clearerr(stdin);
}

void dolly_terminal_publish_result(int status) {
  atomic_store_explicit(&terminal_mailbox.result_status, (uint32_t)status, memory_order_release);
  atomic_fetch_add_explicit(&terminal_mailbox.result_sequence, 1, memory_order_acq_rel);
  emscripten_atomic_notify((void *)&terminal_mailbox.result_sequence,
                           EMSCRIPTEN_NOTIFY_ALL_WAITERS);
}

static void echo_byte(unsigned char byte) {
  dolly_terminal_write_bytes(&byte, 1);
}

// This is Dolly's WasmFS stdin device. It implements a small canonical line
// discipline above the in-Wasm mailbox and never delegates to Emscripten JS.
int _wasmfs_stdin_get_char(void) {
  if (cooked_cursor < cooked_length) return cooked_line[cooked_cursor++];
  if (cooked_boundary) {
    cooked_boundary = 0;
    cooked_length = 0;
    cooked_cursor = 0;
    return -1;
  }

  cooked_length = 0;
  cooked_cursor = 0;
  int escape = 0;
  for (;;) {
    int byte = dolly_terminal_read_raw();
    if (escape != 0) {
      if ((escape == 1 && (byte == '[' || byte == 'O'))) {
        escape = 2;
      } else if (byte >= '@' && byte <= '~') {
        escape = 0;
      }
      continue;
    }
    if (byte == 0x1b) {
      escape = 1;
    } else if (byte == 0x03) {
      cooked_length = 0;
      dolly_terminal_write("^C\r\n");
      cooked_line[cooked_length++] = '\n';
      break;
    } else if (byte == 0x04) {
      if (cooked_length == 0) return -1;
      break;
    } else if (byte == 0x7f || byte == '\b') {
      if (cooked_length != 0) {
        cooked_length--;
        dolly_terminal_write("\b \b");
      }
    } else if (byte == '\r' || byte == '\n') {
      cooked_line[cooked_length++] = '\n';
      dolly_terminal_write("\r\n");
      break;
    } else if (byte >= ' ' && cooked_length + 1 < sizeof(cooked_line)) {
      cooked_line[cooked_length++] = (unsigned char)byte;
      echo_byte((unsigned char)byte);
    }
  }

  cooked_boundary = 1;
  return cooked_line[cooked_cursor++];
}

backend_t wasmfs_create_root_dir(void) {
  return wasmfs_create_memory_backend();
}

int dolly_run_filesystem_module(const char *path, int argc, char **argv) {
  if (exit_depth == DOLLY_MAX_EXIT_DEPTH) return 125;
  dolly_exit_frame *frame = &exit_frames[exit_depth++];
  void *volatile module = NULL;
  int status = 0;
  frame->callback_count = 0;

  if (setjmp(frame->environment) == 0) {
    module = dlopen(path, RTLD_NOW | RTLD_LOCAL);
    if (module == NULL) {
      fprintf(stderr, "dolly: dlopen %s failed: %s\n", path, dlerror());
      status = 1;
    } else if (prepare_module_image(path, (void *)module) != 0) {
      fprintf(stderr, "dolly: could not initialize command image %s\n", path);
      status = 1;
    } else {
      dlerror();
      dolly_program_entry entry =
          (dolly_program_entry)dlsym((void *)module, "dolly_main");
      const char *error = dlerror();
      if (error != NULL) {
        fprintf(stderr, "dolly: dlsym dolly_main failed: %s\n", error);
        status = 2;
      } else {
        status = entry(argc, argv);
      }
    }
  } else {
    status = frame->status;
  }

  while (frame->callback_count != 0) {
    void (*callback)(void) = frame->callbacks[--frame->callback_count];
    callback();
  }
  exit_depth--;
  if (module != NULL && dlclose((void *)module) != 0) {
    fprintf(stderr, "dolly: dlclose %s failed: %s\n", path, dlerror());
    if (status == 0) status = 3;
  }
  return status;
}

_Noreturn void dolly_exit(int status) {
  if (exit_depth == 0) abort();
  fflush(NULL);
  exit_frames[exit_depth - 1].status = status;
  longjmp(exit_frames[exit_depth - 1].environment, 1);
}

_Noreturn void dolly_assert_fail(const char *condition, const char *file,
                                 unsigned line, const char *function) {
  fprintf(stderr, "%s:%u: %s: assertion failed: %s\n",
          file, line, function, condition);
  dolly_exit(134);
}

int dolly_fclose(FILE *stream) {
  if (stream == stdin || stream == stdout || stream == stderr) {
    return fflush(stream);
  }
  return fclose(stream);
}

int dolly_system(const char *command) {
  if (command == NULL) return 0;
  errno = ENOSYS;
  return -1;
}

FILE *dolly_popen(const char *command, const char *mode) {
  (void)command;
  (void)mode;
  errno = ENOSYS;
  return NULL;
}

int dolly_pclose(FILE *stream) {
  (void)stream;
  errno = ENOSYS;
  return -1;
}

int dolly_atexit(void (*callback)(void)) {
  if (exit_depth == 0 || callback == NULL) {
    errno = EINVAL;
    return -1;
  }
  dolly_exit_frame *frame = &exit_frames[exit_depth - 1];
  if (frame->callback_count == DOLLY_MAX_EXIT_CALLBACKS) {
    errno = ENOMEM;
    return -1;
  }
  frame->callbacks[frame->callback_count++] = callback;
  return 0;
}

int dolly_chmod(const char *path, mode_t mode) {
  (void)mode;
  return access(path, F_OK);
}

mode_t dolly_umask(mode_t mask) {
  (void)mask;
  return 0;
}

char *dolly_getpass(const char *prompt) {
  static char password[256];
  if (prompt != NULL) {
    fputs(prompt, stderr);
    fflush(stderr);
  }
  if (fgets(password, sizeof(password), stdin) == NULL) return NULL;
  password[strcspn(password, "\r\n")] = '\0';
  return password;
}

ssize_t dolly_getrandom(void *buffer, size_t length, unsigned flags) {
  (void)flags;
  if (getentropy(buffer, length) != 0) return -1;
  return (ssize_t)length;
}

static int unavailable(void) {
  errno = ENOSYS;
  return -1;
}

pid_t dolly_fork(void) { return (pid_t)unavailable(); }

int dolly_execve(const char *path, char *const argv[], char *const envp[]) {
  (void)path;
  (void)argv;
  (void)envp;
  return unavailable();
}

int dolly_execvp(const char *file, char *const argv[]) {
  (void)file;
  (void)argv;
  return unavailable();
}

int dolly_execl(const char *path, const char *arg, ...) {
  (void)path;
  (void)arg;
  return unavailable();
}

int dolly_execlp(const char *file, const char *arg, ...) {
  (void)file;
  (void)arg;
  return unavailable();
}

pid_t dolly_waitpid(pid_t pid, int *status, int options) {
  (void)pid;
  (void)status;
  (void)options;
  return (pid_t)unavailable();
}

pid_t dolly_wait_any(int *status) {
  (void)status;
  return (pid_t)unavailable();
}

int dolly_kill(pid_t pid, int signal_number) {
  (void)pid;
  (void)signal_number;
  return unavailable();
}

pid_t dolly_setsid(void) { return (pid_t)unavailable(); }

pid_t dolly_getpgid(pid_t pid) {
  (void)pid;
  return (pid_t)unavailable();
}

pid_t dolly_tcgetpgrp(int fd) {
  (void)fd;
  return (pid_t)unavailable();
}

unsigned dolly_alarm(unsigned seconds) {
  (void)seconds;
  errno = ENOSYS;
  return 0;
}

unsigned dolly_sleep(unsigned seconds) {
  (void)seconds;
  return 0;
}

int dolly_setitimer(int which, const struct itimerval *new_value,
                    struct itimerval *old_value) {
  (void)which;
  (void)new_value;
  (void)old_value;
  return unavailable();
}

int dolly_select(int nfds, fd_set *readfds, fd_set *writefds,
                 fd_set *exceptfds, struct timeval *timeout) {
  (void)nfds;
  (void)readfds;
  (void)writefds;
  (void)exceptfds;
  (void)timeout;
  return unavailable();
}

_Noreturn void dolly__exit(int status) { dolly_exit(status); }

int dolly_socket(int domain, int type, int protocol) {
  (void)domain;
  (void)type;
  (void)protocol;
  return unavailable();
}

int dolly_connect(int socket_fd, const struct sockaddr *address,
                  socklen_t address_length) {
  (void)socket_fd;
  (void)address;
  (void)address_length;
  return unavailable();
}

ssize_t dolly_recv(int socket_fd, void *buffer, size_t length, int flags) {
  (void)socket_fd;
  (void)buffer;
  (void)length;
  (void)flags;
  return (ssize_t)unavailable();
}

int dolly_setsockopt(int socket_fd, int level, int option, const void *value,
                     socklen_t value_length) {
  (void)socket_fd;
  (void)level;
  (void)option;
  (void)value;
  (void)value_length;
  return unavailable();
}

int dolly_shutdown(int socket_fd, int how) {
  (void)socket_fd;
  (void)how;
  return unavailable();
}

struct hostent *dolly_gethostbyname(const char *name) {
  (void)name;
  h_errno = HOST_NOT_FOUND;
  return NULL;
}

struct servent *dolly_getservbyname(const char *name, const char *protocol) {
  (void)name;
  (void)protocol;
  h_errno = HOST_NOT_FOUND;
  return NULL;
}

enum {
  DOLLY_MAX_PROCESSES = 32,
  DOLLY_PROCESS_FREE = 0,
  DOLLY_PROCESS_RUNNING = 1,
  DOLLY_PROCESS_EXITED = 2,
};

typedef struct {
  int pid;
  int state;
  int status;
} dolly_process;

static dolly_process processes[DOLLY_MAX_PROCESSES];
static int next_pid = 1;

typedef struct {
  char **entries;
  size_t count;
} dolly_environment_snapshot;

static void dispose_environment_snapshot(dolly_environment_snapshot *snapshot) {
  if (snapshot == NULL) return;
  for (size_t index = 0; index < snapshot->count; index++) {
    free(snapshot->entries[index]);
  }
  free(snapshot->entries);
  snapshot->entries = NULL;
  snapshot->count = 0;
}

static int capture_environment(dolly_environment_snapshot *snapshot) {
  snapshot->entries = NULL;
  snapshot->count = 0;
  while (environ != NULL && environ[snapshot->count] != NULL) {
    snapshot->count++;
  }
  snapshot->entries = calloc(snapshot->count, sizeof(*snapshot->entries));
  if (snapshot->count != 0 && snapshot->entries == NULL) return -ENOMEM;
  for (size_t index = 0; index < snapshot->count; index++) {
    snapshot->entries[index] = strdup(environ[index]);
    if (snapshot->entries[index] == NULL) {
      dispose_environment_snapshot(snapshot);
      return -ENOMEM;
    }
  }
  return 0;
}

static int restore_environment(const dolly_environment_snapshot *snapshot) {
  while (environ != NULL && environ[0] != NULL) {
    const char *equals = strchr(environ[0], '=');
    if (equals == NULL) return -EINVAL;
    char *name = strndup(environ[0], (size_t)(equals - environ[0]));
    if (name == NULL) return -ENOMEM;
    int status = unsetenv(name);
    free(name);
    if (status != 0) return -errno;
  }
  for (size_t index = 0; index < snapshot->count; index++) {
    const char *equals = strchr(snapshot->entries[index], '=');
    if (equals == NULL) return -EINVAL;
    char *name = strndup(snapshot->entries[index],
                         (size_t)(equals - snapshot->entries[index]));
    if (name == NULL) return -ENOMEM;
    int status = setenv(name, equals + 1, 1);
    free(name);
    if (status != 0) return -errno;
  }
  return 0;
}

static int replace_environment(char *const entries[]) {
  while (environ != NULL && environ[0] != NULL) {
    const char *equals = strchr(environ[0], '=');
    if (equals == NULL) return -EINVAL;
    char *name = strndup(environ[0], (size_t)(equals - environ[0]));
    if (name == NULL) return -ENOMEM;
    int status = unsetenv(name);
    free(name);
    if (status != 0) return -errno;
  }
  if (entries == NULL) return 0;
  for (size_t index = 0; entries[index] != NULL; index++) {
    const char *equals = strchr(entries[index], '=');
    if (equals == NULL) return -EINVAL;
    char *name = strndup(entries[index], (size_t)(equals - entries[index]));
    if (name == NULL) return -ENOMEM;
    int status = setenv(name, equals + 1, 1);
    free(name);
    if (status != 0) return -errno;
  }
  return 0;
}

static dolly_process *allocate_process(void) {
  for (size_t index = 0; index < DOLLY_MAX_PROCESSES; index++) {
    if (processes[index].state == DOLLY_PROCESS_FREE) {
      processes[index].pid = next_pid++;
      if (next_pid <= 0) next_pid = 1;
      processes[index].state = DOLLY_PROCESS_RUNNING;
      processes[index].status = 0;
      return &processes[index];
    }
  }
  return NULL;
}

int dolly_write_file(const char *path, const void *bytes, size_t length) {
  if (path == NULL || (bytes == NULL && length != 0)) return -EINVAL;
  int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0666);
  if (fd < 0) return -errno;

  const unsigned char *cursor = bytes;
  size_t remaining = length;
  int status = 0;
  while (remaining != 0) {
    const ssize_t written = write(fd, cursor, remaining);
    if (written < 0) {
      status = -errno;
      break;
    }
    if (written == 0) {
      status = -EIO;
      break;
    }
    cursor += (size_t)written;
    remaining -= (size_t)written;
  }
  if (close(fd) != 0 && status == 0) status = -errno;
  return status;
}

static int compile_sources(const char *const *sources, size_t source_count,
                           const char *const *options, size_t option_count,
                           const char *output,
                           int default_language) {
  size_t argument_count = source_count + option_count + 3;
  if (argument_count > INT32_MAX) return 64;
  char **arguments = calloc(argument_count + 1, sizeof(*arguments));
  if (arguments == NULL) return 1;

  size_t index = 0;
  arguments[index++] = default_language == DOLLY_TOOLCHAIN_CXX ? "c++" : "cc";
  for (size_t option = 0; option < option_count; option++) {
    arguments[index++] = (char *)options[option];
  }
  for (size_t source = 0; source < source_count; source++) {
    arguments[index++] = (char *)sources[source];
  }
  arguments[index++] = "-o";
  arguments[index++] = (char *)output;

  int status = dolly_toolchain_main((int)argument_count, arguments,
                                    default_language);
  free(arguments);
  return status;
}

static int compile_source(const char *source, const char *output,
                          int default_language) {
  return compile_sources(&source, 1, NULL, 0, output, default_language);
}

int dolly_spawn(const char *path, int argc, char **argv,
                int stdin_fd, int stdout_fd, int stderr_fd) {
  if (path == NULL || argc < 0 || argv == NULL) return -EINVAL;

  dolly_process *process = allocate_process();
  if (process == NULL) return -EAGAIN;

  char saved_cwd[4096];
  dolly_environment_snapshot saved_environment = {0};
  if (getcwd(saved_cwd, sizeof(saved_cwd)) == NULL ||
      capture_environment(&saved_environment) != 0) {
    process->state = DOLLY_PROCESS_FREE;
    dispose_environment_snapshot(&saved_environment);
    return -ENOMEM;
  }

  int saved[3] = {dup(STDIN_FILENO), dup(STDOUT_FILENO), dup(STDERR_FILENO)};
  int requested[3] = {stdin_fd, stdout_fd, stderr_fd};
  int status = 126;
  int previous_pid = (int)atomic_load_explicit(&terminal_mailbox.foreground_pid,
                                                memory_order_acquire);

  fflush(NULL);
  if (saved[0] < 0 || saved[1] < 0 || saved[2] < 0) {
    fputs("dolly: could not save standard descriptors\n", stderr);
  } else if (dup2(requested[0], STDIN_FILENO) < 0 ||
             dup2(requested[1], STDOUT_FILENO) < 0 ||
             dup2(requested[2], STDERR_FILENO) < 0) {
    fputs("dolly: could not route standard descriptors\n", stderr);
  } else {
    clearerr(stdin);
    clearerr(stdout);
    clearerr(stderr);
    dolly_terminal_reset_cooked();
    atomic_store_explicit(&terminal_mailbox.foreground_pid, (uint32_t)process->pid,
                          memory_order_release);
    status = dolly_run_filesystem_module(path, argc, argv);
  }

  fflush(NULL);
  // WasmFS's terminal devices have a second byte buffer below libc. Flush it
  // at the command boundary so output without a trailing newline is visible
  // before the shell prints its next prompt.
  fsync(STDOUT_FILENO);
  fsync(STDERR_FILENO);
  for (int fd = 0; fd < 3; fd++) {
    if (saved[fd] >= 0) {
      dup2(saved[fd], fd);
      close(saved[fd]);
    }
  }
  clearerr(stdin);
  clearerr(stdout);
  clearerr(stderr);
  dolly_terminal_reset_cooked();
  atomic_store_explicit(&terminal_mailbox.foreground_pid, (uint32_t)previous_pid,
                        memory_order_release);

  int context_status = 0;
  if (chdir(saved_cwd) != 0) context_status = -errno;
  int environment_status = restore_environment(&saved_environment);
  dispose_environment_snapshot(&saved_environment);
  if (context_status == 0) context_status = environment_status;
  if (context_status != 0) {
    fprintf(stderr, "dolly: could not restore command context: %s\n",
            strerror(-context_status));
    status = 126;
  }

  process->status = status;
  process->state = DOLLY_PROCESS_EXITED;
  return process->pid;
}

int dolly_wait(int pid, int *status) {
  if (status == NULL) return -EINVAL;
  for (size_t index = 0; index < DOLLY_MAX_PROCESSES; index++) {
    dolly_process *process = &processes[index];
    if (process->state != DOLLY_PROCESS_FREE && process->pid == pid) {
      if (process->state != DOLLY_PROCESS_EXITED) return -EAGAIN;
      *status = process->status;
      process->state = DOLLY_PROCESS_FREE;
      return 0;
    }
  }
  return -ECHILD;
}

int dolly_spawn_env(const char *path, int argc, char **argv, char *const envp[],
                    int stdin_fd, int stdout_fd, int stderr_fd) {
  if (envp == NULL) {
    return dolly_spawn(path, argc, argv, stdin_fd, stdout_fd, stderr_fd);
  }
  dolly_environment_snapshot parent = {0};
  int result = capture_environment(&parent);
  if (result != 0) return result;
  result = replace_environment(envp);
  if (result == 0) {
    result = dolly_spawn(path, argc, argv, stdin_fd, stdout_fd, stderr_fd);
  }
  int restore_status = restore_environment(&parent);
  dispose_environment_snapshot(&parent);
  return result >= 0 && restore_status != 0 ? restore_status : result;
}

EMSCRIPTEN_KEEPALIVE
int dolly_bootstrap(void) {
  int output = open("/dev/dolly-stdout", O_WRONLY);
  int error = open("/dev/dolly-stderr", O_WRONLY);
  if (output < 0 || error < 0 || dup2(output, STDOUT_FILENO) < 0 ||
      dup2(error, STDERR_FILENO) < 0) {
    if (output >= 0) close(output);
    if (error >= 0) close(error);
    return 1;
  }
  close(output);
  close(error);

  if (mkdir("/bin", 0755) != 0 && errno != EEXIST) {
    fprintf(stderr, "dolly: mkdir /bin failed: %s\n", strerror(errno));
    return 1;
  }
  if (mkdir("/tmp", 0755) != 0 && errno != EEXIST) {
    fprintf(stderr, "dolly: mkdir /tmp failed: %s\n", strerror(errno));
    return 1;
  }
  if (setenv("HOME", "/home/dolly", 1) != 0) {
    fprintf(stderr, "dolly: HOME initialization failed: %s\n", strerror(errno));
    return 1;
  }
  if (setenv("PATH", "/bin:/usr/bin", 1) != 0) {
    fprintf(stderr, "dolly: PATH initialization failed: %s\n", strerror(errno));
    return 1;
  }
  static const struct {
    const char *source;
    const char *output;
  } core_commands[] = {
      {"/usr/src/dolly/slop.c", "/bin/slop"},
      {"/usr/src/dolly/commands/help.c", "/bin/help"},
      {"/usr/src/dolly/commands/pwd.c", "/bin/pwd"},
      {"/usr/src/dolly/commands/cd.c", "/bin/cd"},
      {"/usr/src/dolly/commands/cat.c", "/bin/cat"},
      {"/usr/src/dolly/commands/echo.c", "/bin/echo"},
      {"/usr/src/dolly/commands/mkdir.c", "/bin/mkdir"},
      {"/usr/src/dolly/commands/touch.c", "/bin/touch"},
      {"/usr/src/dolly/commands/rm.c", "/bin/rm"},
      {"/usr/src/dolly/commands/clear.c", "/bin/clear"},
      {"/usr/src/dolly/commands/ls.c", "/bin/ls"},
      {"/usr/src/dolly/commands/cc.c", "/bin/cc"},
      {"/usr/src/dolly/commands/c++.c", "/bin/c++"},
      {"/usr/src/dolly/commands/ld.c", "/bin/ld"},
      {"/usr/src/dolly/commands/ar.c", "/bin/ar"},
  };
  for (size_t index = 0;
       index < sizeof(core_commands) / sizeof(core_commands[0]); index++) {
    printf("dolly: compiling %s to %s inside Wasm\n",
           core_commands[index].source, core_commands[index].output);
    int status = compile_source(core_commands[index].source,
                                core_commands[index].output,
                                DOLLY_TOOLCHAIN_C);
    if (status != 0) {
      fprintf(stderr, "dolly: compiler failed for %s with status %d\n",
              core_commands[index].output, status);
      return status;
    }
  }
  puts("dolly: installed separately compiled core commands in /bin");

  char *startup_argv[] = {"slop", "/etc/dolly/startup.slop", NULL};
  int startup_pid = dolly_spawn("/bin/slop", 2, startup_argv,
                                STDIN_FILENO, STDOUT_FILENO, STDERR_FILENO);
  if (startup_pid < 0) {
    fprintf(stderr, "dolly: could not launch startup.slop: %s\n",
            strerror(-startup_pid));
    return 126;
  }
  int startup_status = 126;
  int wait_status = dolly_wait(startup_pid, &startup_status);
  if (wait_status != 0) {
    fprintf(stderr, "dolly: could not wait for startup.slop: %s\n",
            strerror(-wait_status));
    return 126;
  }
  return startup_status;
}

EMSCRIPTEN_KEEPALIVE
int dolly_shell_run(void) {
  char *argv[] = {"slop", NULL};
  int pid = dolly_spawn("/bin/slop", 1, argv,
                        STDIN_FILENO, STDOUT_FILENO, STDERR_FILENO);
  if (pid < 0) {
    fprintf(stderr, "dolly: could not launch /bin/slop: %s\n", strerror(-pid));
    return 126;
  }
  int status = 126;
  int wait_status = dolly_wait(pid, &status);
  if (wait_status != 0) {
    fprintf(stderr, "dolly: could not wait for /bin/slop: %s\n",
            strerror(-wait_status));
    return 126;
  }
  return status;
}

int main(void) {
  return 0;
}
