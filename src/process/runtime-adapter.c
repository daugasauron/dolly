#define _GNU_SOURCE

#include <dolly/process.h>
#include <dolly/runtime.h>
#include <dolly/toolchain.h>

#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <netdb.h>
#include <pthread.h>
#include <signal.h>
#include <spawn.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <sys/random.h>
#include <time.h>
#include <unistd.h>
#include "lock.h"

extern char **environ;

static uint64_t monotonic_nanoseconds(void) {
  struct timespec value;
  return clock_gettime(CLOCK_MONOTONIC, &value) == 0
      ? (uint64_t)value.tv_sec * 1000000000u + (uint64_t)value.tv_nsec : 0;
}

static int spawn_mapped(const char *path, int argc, char **argv,
                        char *const envp[], const char *cwd,
                        uint32_t descriptor_inheritance,
                        const dolly_process_fd_mapping *mappings,
                        uint32_t mapping_count, double timeout_milliseconds,
                        uint32_t flags) {
  /* A timeout is -1 (none) or a delay the kernel accepts, at most one day. */
  if (path == NULL || argv == NULL || argc <= 0 ||
      descriptor_inheritance > DOLLY_PROCESS_INHERIT_FDS_ALL ||
      (mapping_count != 0 && mappings == NULL) ||
      !(timeout_milliseconds == -1 || timeout_milliseconds >= 0)) return -EINVAL;
  if (mapping_count > DOLLY_PROCESS_PACKET_LIMIT / sizeof(*mappings)) return -E2BIG;
  const size_t mapping_bytes = mapping_count * sizeof(*mappings);
  const size_t path_size = strlen(path);
  const size_t cwd_size = cwd == NULL ? 0 : strlen(cwd);
  if (cwd != NULL && (cwd_size == 0 || cwd_size > 4096 || cwd[0] != '/')) return -EINVAL;
  if (path_size == 0 || path_size > 4096 || path[0] != '/') return -EINVAL;
  size_t argument_bytes = 0;
  for (int index = 0; index < argc; ++index) {
    if (argv[index] == NULL) return -EINVAL;
    const size_t length = strlen(argv[index]) + 1;
    if (length > DOLLY_PROCESS_PACKET_LIMIT - argument_bytes) return -E2BIG;
    argument_bytes += length;
  }
  uint32_t environment_count = 0;
  size_t environment_bytes = 0;
  if (envp != NULL) {
    while (envp[environment_count] != NULL) {
      const size_t length = strlen(envp[environment_count]) + 1;
      if (length > DOLLY_PROCESS_PACKET_LIMIT - environment_bytes ||
          environment_count == UINT32_MAX) return -E2BIG;
      environment_bytes += length;
      ++environment_count;
    }
  }
  const size_t packet_size = sizeof(dolly_process_spawn_request) +
      path_size + argument_bytes + environment_bytes + cwd_size + mapping_bytes;
  if (packet_size > DOLLY_PROCESS_PACKET_LIMIT) return -E2BIG;
  unsigned char *packet = malloc(packet_size);
  if (packet == NULL) return -ENOMEM;
  uint64_t deadline = UINT64_MAX;
  if (timeout_milliseconds >= 0) {
    const uint64_t now = monotonic_nanoseconds();
    const double delta = timeout_milliseconds * 1000000.0;
    if (now == 0 || delta < 0 || delta > (double)(UINT64_MAX - now)) {
      free(packet);
      return -EINVAL;
    }
    deadline = now + (uint64_t)delta;
  }
  const dolly_process_spawn_request request = {
      flags | (envp == NULL ? DOLLY_PROCESS_SPAWN_INHERIT_ENVIRONMENT : 0),
      (uint32_t)argc,
      environment_count,
      (uint32_t)cwd_size,
      mapping_count,
      descriptor_inheritance,
      0,
      (uint32_t)path_size,
      argument_bytes,
      environment_bytes,
      deadline,
  };
  memcpy(packet, &request, sizeof(request));
  size_t offset = sizeof(request);
  memcpy(packet + offset, path, path_size);
  offset += path_size;
  for (int index = 0; index < argc; ++index) {
    const size_t length = strlen(argv[index]) + 1;
    memcpy(packet + offset, argv[index], length);
    offset += length;
  }
  for (uint32_t index = 0; index < environment_count; ++index) {
    const size_t length = strlen(envp[index]) + 1;
    memcpy(packet + offset, envp[index], length);
    offset += length;
  }
  if (cwd_size != 0) memcpy(packet + offset, cwd, cwd_size);
  offset += cwd_size;
  if (mapping_bytes != 0) memcpy(packet + offset, mappings, mapping_bytes);
  dolly_process_spawn_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_SPAWN, packet, packet_size, &response, sizeof(response));
  free(packet);
  if (result < 0) return (int)result;
  return (uint64_t)result == sizeof(response) && response.reserved == 0 &&
      response.pid <= INT32_MAX ? (int)response.pid : -EIO;
}

int dolly_spawn_mapped(const char *path, int argc, char **argv,
                        char *const envp[], const char *cwd,
                        uint32_t descriptor_inheritance,
                        const dolly_process_fd_mapping *mappings,
                        uint32_t mapping_count, double timeout_milliseconds) {
  return spawn_mapped(path, argc, argv, envp, cwd, descriptor_inheritance,
                      mappings, mapping_count, timeout_milliseconds, 0);
}

int dolly_spawn_foreground(const char *path, int argc, char **argv,
                           int interactive) {
  if (interactive != 0 && interactive != 1) return -EINVAL;
  const dolly_process_fd_mapping mappings[] = {{0, 0}, {1, 1}, {2, 2}};
  return spawn_mapped(path, argc, argv, environ, NULL,
      DOLLY_PROCESS_INHERIT_FDS_NONE, mappings, 3, -1,
      DOLLY_PROCESS_SPAWN_FOREGROUND |
          (interactive ? DOLLY_PROCESS_SPAWN_INTERACTIVE : 0));
}

static int spawn_process(const char *path, int argc, char **argv,
                         char *const envp[], int stdin_fd, int stdout_fd,
                         int stderr_fd, double timeout_milliseconds, const char *cwd) {
  const dolly_process_fd_mapping mappings[] = {
      {(uint32_t)stdin_fd, 0}, {(uint32_t)stdout_fd, 1}, {(uint32_t)stderr_fd, 2},
  };
  return dolly_spawn_mapped(path, argc, argv, envp, cwd,
      DOLLY_PROCESS_INHERIT_FDS_NONE, mappings, 3, timeout_milliseconds);
}

int dolly_spawn(const char *path, int argc, char **argv,
                int stdin_fd, int stdout_fd, int stderr_fd) {
  return spawn_process(path, argc, argv, environ,
                       stdin_fd, stdout_fd, stderr_fd, -1, NULL);
}

int dolly_spawn_timeout(const char *path, int argc, char **argv,
                        int stdin_fd, int stdout_fd, int stderr_fd,
                        double timeout_milliseconds) {
  return spawn_process(path, argc, argv, environ, stdin_fd, stdout_fd, stderr_fd,
                       timeout_milliseconds, NULL);
}

int dolly_spawn_env(const char *path, int argc, char **argv, char *const envp[],
                    int stdin_fd, int stdout_fd, int stderr_fd) {
  return spawn_process(path, argc, argv, envp,
                       stdin_fd, stdout_fd, stderr_fd, -1, NULL);
}

int dolly_spawn_env_timeout(const char *path, int argc, char **argv,
                            char *const envp[], int stdin_fd, int stdout_fd,
                            int stderr_fd, double timeout_milliseconds) {
  return spawn_process(path, argc, argv, envp, stdin_fd, stdout_fd, stderr_fd,
                       timeout_milliseconds, NULL);
}

int dolly_spawn_env_cwd(const char *path, int argc, char **argv,
                        char *const envp[], const char *cwd, int stdin_fd,
                        int stdout_fd, int stderr_fd, double timeout_milliseconds) {
  return spawn_process(path, argc, argv, envp, stdin_fd, stdout_fd, stderr_fd,
                       timeout_milliseconds, cwd);
}

/* pid zero waits for any child. */
static int wait_process(uint32_t pid, uint32_t flags, dolly_process_wait_response *response) {
  const dolly_process_wait_request request = {pid, flags};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_WAIT, &request, sizeof(request),
      response, sizeof(*response));
  if (result < 0) return (int)result;
  const uint32_t signal_number = response->signal_number;
  if ((uint64_t)result != sizeof(*response) || response->reserved != 0 ||
      response->pid == 0 || response->pid > INT32_MAX ||
      (pid != 0 && response->pid != pid) || response->status > 255 ||
      (signal_number != 0 &&
       (signal_number >= 32 || ((DOLLY_PROCESS_SIGNAL_MASK >> signal_number) & 1u) == 0 ||
        response->status != 128 + signal_number))) return -EIO;
  return 0;
}

int dolly_wait(int pid, int *status) {
  if (status == NULL) return -EINVAL;
  if (pid <= 0) return -ECHILD;
  dolly_process_wait_response response;
  const int result = wait_process((uint32_t)pid, 0, &response);
  if (result == 0) *status = (int)response.status;
  return result;
}

int dolly_toolchain_proxy(int argc, char **argv, int default_language) {
  static const char *const modes[] = {
      "--dolly-toolchain-mode=c",
      "--dolly-toolchain-mode=c++",
      "--dolly-toolchain-mode=ld",
      "--dolly-toolchain-mode=ar",
  };
  if (argc <= 0 || argv == NULL || argv[0] == NULL ||
      default_language < DOLLY_TOOLCHAIN_C ||
      default_language > DOLLY_TOOLCHAIN_AR || argc == INT32_MAX) return 64;
  char **forward = calloc((size_t)argc + 2, sizeof(*forward));
  if (forward == NULL) return 1;
  forward[0] = argv[0];
  forward[1] = (char *)modes[default_language];
  for (int index = 1; index < argc; ++index) forward[index + 1] = argv[index];
  int status = 126;
  /* Retry only 126: survive transient Worker allocation, never hide source errors. */
  for (unsigned attempt = 0; attempt < 3; ++attempt) {
    const int pid = dolly_spawn(
        "/usr/libexec/dolly/process-bin/compiler", argc + 1, forward,
        STDIN_FILENO, STDOUT_FILENO, STDERR_FILENO);
    const int waited = pid < 0 ? pid : dolly_wait(pid, &status);
    if (waited == 0 && status != 126) break;
    status = 126;
    if (attempt != 2) {
      fprintf(stderr,
              "dolly: compiler process failed; retrying %u/3\n",
              attempt + 2);
    }
  }
  free(forward);
  return status;
}

static ssize_t process_getrandom(void *buffer, size_t length, unsigned flags) {
  if ((flags & ~(unsigned)(GRND_NONBLOCK | GRND_RANDOM)) != 0) {
    errno = EINVAL;
    return -1;
  }
  if (buffer == NULL && length != 0) {
    errno = EFAULT;
    return -1;
  }
  if (length > (size_t)SSIZE_MAX) {
    errno = EINVAL;
    return -1;
  }
  unsigned char *cursor = buffer;
  size_t remaining = length;
  while (remaining != 0) {
    const size_t chunk = remaining > DOLLY_PROCESS_PACKET_LIMIT
        ? DOLLY_PROCESS_PACKET_LIMIT : remaining;
    const int64_t result = dolly_process_call(
        DOLLY_PROCESS_RANDOM, NULL, 0, cursor, chunk);
    if (result < 0) {
      errno = (int)-result;
      return -1;
    }
    if ((uint64_t)result != chunk) {
      errno = EIO;
      return -1;
    }
    cursor += chunk;
    remaining -= chunk;
  }
  return (ssize_t)length;
}

ssize_t getrandom(void *buffer, size_t length, unsigned flags) {
  return process_getrandom(buffer, length, flags);
}

ssize_t dolly_getrandom(void *buffer, size_t length, unsigned flags) {
  return process_getrandom(buffer, length, flags);
}

char *getpass(const char *prompt) {
  static char password[256];
  if (prompt != NULL) {
    fputs(prompt, stderr);
    fflush(stderr);
  }
  if (fgets(password, sizeof(password), stdin) == NULL) return NULL;
  password[strcspn(password, "\r\n")] = '\0';
  return password;
}

static int raw_socket_unavailable(void) {
  errno = ENOSYS;
  return -1;
}

int socket(int domain, int type, int protocol) {
  (void)domain;
  (void)type;
  (void)protocol;
  return raw_socket_unavailable();
}

int connect(int descriptor, const struct sockaddr *address,
            socklen_t address_length) {
  (void)descriptor;
  (void)address;
  (void)address_length;
  return raw_socket_unavailable();
}

int bind(int descriptor, const struct sockaddr *address,
         socklen_t address_length) {
  (void)descriptor;
  (void)address;
  (void)address_length;
  return raw_socket_unavailable();
}

int listen(int descriptor, int backlog) {
  (void)descriptor;
  (void)backlog;
  return raw_socket_unavailable();
}

int accept(int descriptor, struct sockaddr *address,
           socklen_t *address_length) {
  (void)descriptor;
  (void)address;
  (void)address_length;
  return raw_socket_unavailable();
}

int accept4(int descriptor, struct sockaddr *address,
            socklen_t *address_length, int flags) {
  (void)flags;
  return accept(descriptor, address, address_length);
}

int getsockname(int descriptor, struct sockaddr *address,
                socklen_t *address_length) {
  (void)descriptor;
  (void)address;
  (void)address_length;
  return raw_socket_unavailable();
}

int getpeername(int descriptor, struct sockaddr *address,
                socklen_t *address_length) {
  return getsockname(descriptor, address, address_length);
}

ssize_t recv(int descriptor, void *buffer, size_t length, int flags) {
  (void)descriptor;
  (void)buffer;
  (void)length;
  (void)flags;
  return (ssize_t)raw_socket_unavailable();
}

ssize_t send(int descriptor, const void *buffer, size_t length, int flags) {
  (void)descriptor;
  (void)buffer;
  (void)length;
  (void)flags;
  return (ssize_t)raw_socket_unavailable();
}

ssize_t sendto(int descriptor, const void *buffer, size_t length, int flags,
               const struct sockaddr *address, socklen_t address_length) {
  (void)address;
  (void)address_length;
  return send(descriptor, buffer, length, flags);
}

ssize_t recvfrom(int descriptor, void *buffer, size_t length, int flags,
                 struct sockaddr *address, socklen_t *address_length) {
  (void)address;
  (void)address_length;
  return recv(descriptor, buffer, length, flags);
}

ssize_t sendmsg(int descriptor, const struct msghdr *message, int flags) {
  (void)descriptor;
  (void)message;
  (void)flags;
  return (ssize_t)raw_socket_unavailable();
}

ssize_t recvmsg(int descriptor, struct msghdr *message, int flags) {
  (void)descriptor;
  (void)message;
  (void)flags;
  return (ssize_t)raw_socket_unavailable();
}

int getsockopt(int descriptor, int level, int option, void *value,
               socklen_t *value_length) {
  (void)descriptor;
  (void)level;
  (void)option;
  (void)value;
  (void)value_length;
  return raw_socket_unavailable();
}

int socketpair(int domain, int type, int protocol, int descriptors[2]) {
  (void)domain;
  (void)type;
  (void)protocol;
  (void)descriptors;
  return raw_socket_unavailable();
}

int setsockopt(int descriptor, int level, int option, const void *value,
               socklen_t value_length) {
  (void)descriptor;
  (void)level;
  (void)option;
  (void)value;
  (void)value_length;
  return raw_socket_unavailable();
}

int shutdown(int descriptor, int how) {
  (void)descriptor;
  (void)how;
  return raw_socket_unavailable();
}

struct hostent *gethostbyname(const char *name) {
  (void)name;
  h_errno = HOST_NOT_FOUND;
  return NULL;
}

int getnameinfo(const struct sockaddr *address, socklen_t address_length,
                char *host, socklen_t host_length,
                char *service, socklen_t service_length, int flags) {
  (void)address;
  (void)address_length;
  (void)host;
  (void)host_length;
  (void)service;
  (void)service_length;
  (void)flags;
  return EAI_FAIL;
}

void _pthread_cleanup_push(struct __ptcb *callback,
                           void (*function)(void *), void *argument) {
  callback->__f = function;
  callback->__x = argument;
  callback->__next = NULL;
}

void _pthread_cleanup_pop(struct __ptcb *callback, int execute) {
  if (execute != 0 && callback != NULL && callback->__f != NULL) {
    callback->__f(callback->__x);
  }
}

struct servent *getservbyname(const char *name, const char *protocol) {
  (void)name;
  (void)protocol;
  h_errno = HOST_NOT_FOUND;
  return NULL;
}

/* -1 and 0 wait for any child; Dolly has no other process groups. */
pid_t dolly_waitpid(pid_t pid, int *status, int options) {
  if ((options & ~WNOHANG) != 0 || pid < -1) {
    errno = pid < -1 ? ECHILD : ENOTSUP;
    return -1;
  }
  dolly_process_wait_response response;
  const int result = wait_process(pid > 0 ? (uint32_t)pid : 0,
      options & WNOHANG ? DOLLY_PROCESS_WAIT_NONBLOCK : 0, &response);
  if (result == -EAGAIN && (options & WNOHANG) != 0) return 0;
  if (result != 0) {
    errno = -result;
    return -1;
  }
  if (status != NULL) *status = response.signal_number != 0
      ? (int)response.signal_number : (int)response.status << 8;
  return (pid_t)response.pid;
}

/* The kernel validates the signal number. */
int dolly_kill(pid_t pid, int signal_number) {
  if (pid <= 0) {
    errno = ENOTSUP;
    return -1;
  }
  const dolly_process_signal_request request = {(uint32_t)pid, (uint32_t)signal_number};
  dolly_process_signal_request response;
  const int64_t result = dolly_process_call(DOLLY_PROCESS_SIGNAL,
      &request, sizeof(request), &response, sizeof(response));
  if (result < 0) { errno = (int)-result; return -1; }
  if ((uint64_t)result != sizeof(response) || response.pid != request.pid ||
      response.signal_number != request.signal_number) { errno = EIO; return -1; }
  return 0;
}

static int terminal_call(uint32_t operation, int descriptor, uint32_t flags,
                         uint64_t deadline, dolly_process_terminal_response *response) {
  const dolly_process_terminal_request request = {
      operation, (uint32_t)descriptor, flags, 0, deadline,
  };
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_TERMINAL, &request, sizeof(request),
      response, sizeof(*response));
  if (result < 0) return (int)result;
  return (uint64_t)result == sizeof(*response) ? 0 : -EIO;
}

int dolly_terminal_read_raw_timeout(double milliseconds) {
  uint64_t deadline = UINT64_MAX;
  if (milliseconds == 0) deadline = 0;
  else if (milliseconds > 0) {
    const uint64_t now = monotonic_nanoseconds();
    const double delta = milliseconds * 1000000.0;
    if (now == 0 || delta > (double)(UINT64_MAX - now)) return -1;
    deadline = now + (uint64_t)delta;
  }
  dolly_process_terminal_response response = {0};
  return terminal_call(DOLLY_PROCESS_TERMINAL_READ, STDIN_FILENO, 0,
                       deadline, &response) == 0 ? (int)response.value : -1;
}

uint32_t dolly_terminal_columns(void) {
  dolly_process_terminal_response response = {0};
  return terminal_call(DOLLY_PROCESS_TERMINAL_SIZE, STDIN_FILENO, 0, 0,
                       &response) == 0 ? response.columns : 80;
}

uint32_t dolly_terminal_rows(void) {
  dolly_process_terminal_response response = {0};
  return terminal_call(DOLLY_PROCESS_TERMINAL_SIZE, STDIN_FILENO, 0, 0,
                       &response) == 0 ? response.rows : 24;
}

int dolly_isatty(int descriptor) {
  dolly_process_terminal_response response = {0};
  const int result = terminal_call(DOLLY_PROCESS_TERMINAL_ISATTY,
                                   descriptor, 0, 0, &response);
  if (result < 0) {
    errno = -result;
    return 0;
  }
  if (response.value != 0 && response.value != 1) {
    errno = EIO;
    return 0;
  }
  if (response.value == 0) errno = ENOTTY;
  return response.value;
}

int dolly_terminal_mode_get(int descriptor) {
  dolly_process_terminal_response response = {0};
  const int result = terminal_call(DOLLY_PROCESS_TERMINAL_MODE_GET,
                                   descriptor, 0, 0, &response);
  return result == 0 ? (int)response.value : result;
}

int dolly_terminal_mode_set(int descriptor, uint32_t flags) {
  dolly_process_terminal_response response = {0};
  return terminal_call(DOLLY_PROCESS_TERMINAL_MODE_SET,
                       descriptor, flags, 0, &response);
}

void dolly_terminal_publish_result(int status) {
  dolly_process_terminal_response response = {0};
  (void)terminal_call(DOLLY_PROCESS_TERMINAL_PUBLISH_RESULT,
                      STDOUT_FILENO, (uint32_t)status, 0, &response);
}

int dolly_interrupt_poll(void) {
  int32_t response = 0;
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_INTERRUPT_POLL, NULL, 0, &response, sizeof(response));
  if (result != sizeof(response) || !response) return 0;
  if (response != SIGINT) raise(response);
  int32_t pending;
  (void)dolly_process_call(DOLLY_PROCESS_SIGNAL_ACKNOWLEDGE,
      &response, sizeof(response), &pending, sizeof(pending));
  return response == SIGINT ? response : 0;
}

void dolly_interrupt_checkpoint(void) {
  dolly_process_info_response response;
  (void)dolly_process_call(DOLLY_PROCESS_INFO, NULL, 0, &response, sizeof(response));
}

void dolly_exit_signal(int signal_number) {
  const dolly_process_exit_request request = {
      (uint32_t)(128 + signal_number), (uint32_t)signal_number,
  };
  (void)dolly_process_call(DOLLY_PROCESS_EXIT, &request, sizeof(request), NULL, 0);
  __builtin_trap();
}

void dolly_exit(int status) {
  const dolly_process_exit_request request = {(uint32_t)(status & 255), 0};
  (void)dolly_process_call(DOLLY_PROCESS_EXIT, &request, sizeof(request), NULL, 0);
  __builtin_trap();
}

int dolly_write_file(const char *path, const void *bytes, size_t length) {
  int descriptor = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0666);
  if (descriptor < 0) return -errno;
  size_t offset = 0;
  while (offset < length) {
    ssize_t count = write(descriptor, (const unsigned char *)bytes + offset,
                          length - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) {
      const int result = count == 0 ? -EIO : -errno;
      close(descriptor);
      return result;
    }
    offset += (size_t)count;
  }
  return close(descriptor) == 0 ? 0 : -errno;
}

static _Thread_local char dso_error[DOLLY_PROCESS_DSO_ERROR_CAPACITY + 1];
static _Thread_local int dso_error_pending;

static void clear_dso_error(void) {
  dso_error[0] = 0;
  dso_error_pending = 0;
}

static void set_dso_error(const dolly_process_dso_response *response,
                          int fallback) {
  size_t size = response == NULL ? 0 : response->message_size;
  if (size > DOLLY_PROCESS_DSO_ERROR_CAPACITY) size = 0;
  if (size != 0) memcpy(dso_error, response->message, size);
  if (size == 0) {
    const char *message = strerror(fallback > 0 ? fallback : ENOEXEC);
    size = strlen(message);
    if (size > DOLLY_PROCESS_DSO_ERROR_CAPACITY) {
      size = DOLLY_PROCESS_DSO_ERROR_CAPACITY;
    }
    memcpy(dso_error, message, size);
  }
  dso_error[size] = 0;
  dso_error_pending = 1;
}

static int decode_dso_response(int64_t result,
                               dolly_process_dso_response *response) {
  if (result < 0) {
    set_dso_error(NULL, (int)-result);
    return -1;
  }
  if ((uint64_t)result != sizeof(*response) ||
      response->message_size > DOLLY_PROCESS_DSO_ERROR_CAPACITY) {
    set_dso_error(NULL, EIO);
    return -1;
  }
  if (response->error != 0) {
    set_dso_error(response, response->error);
    errno = response->error;
    return -1;
  }
  return 0;
}

__attribute__((used, visibility("default")))
uintptr_t __dolly_dso_allocate(uint64_t size, uint64_t alignment) {
  if (size > SIZE_MAX || alignment > SIZE_MAX || alignment == 0 ||
      (alignment & (alignment - 1)) != 0) return 0;
  size_t native_alignment = (size_t)alignment;
  if (native_alignment < sizeof(void *)) native_alignment = sizeof(void *);
  void *allocation = NULL;
  const size_t native_size = size == 0 ? 1 : (size_t)size;
  if (posix_memalign(&allocation, native_alignment, native_size) != 0) return 0;
  memset(allocation, 0, native_size);
  return (uintptr_t)allocation;
}

void *dolly_dlopen(const char *path, int flags) {
  clear_dso_error();
  int known_flags = RTLD_LAZY | RTLD_NOW | RTLD_LOCAL | RTLD_GLOBAL;
#ifdef RTLD_NODELETE
  known_flags |= RTLD_NODELETE;
#endif
  if ((flags & ~known_flags) != 0 ||
      ((flags & RTLD_LAZY) != 0 && (flags & RTLD_NOW) != 0)) {
    set_dso_error(NULL, EINVAL);
    errno = EINVAL;
    return NULL;
  }

  unsigned char *packet = NULL;
  size_t packet_size = sizeof(dolly_process_dso_open_request);
  uint64_t image_size = 0;
  int descriptor = -1;
  if (path != NULL) {
    descriptor = open(path, O_RDONLY);
    struct stat metadata;
    if (descriptor < 0 || fstat(descriptor, &metadata) != 0 ||
        !S_ISREG(metadata.st_mode) || metadata.st_size <= 0 ||
        (uint64_t)metadata.st_size > DOLLY_PROCESS_DSO_LIMIT) {
      const int error = descriptor < 0 ? errno : ENOEXEC;
      if (descriptor >= 0) close(descriptor);
      set_dso_error(NULL, error);
      errno = error;
      return NULL;
    }
    image_size = (uint64_t)metadata.st_size;
    packet_size += (size_t)image_size;
  }
  packet = malloc(packet_size);
  if (packet == NULL) {
    if (descriptor >= 0) close(descriptor);
    set_dso_error(NULL, ENOMEM);
    return NULL;
  }
  const dolly_process_dso_open_request request = {
      (flags & RTLD_GLOBAL) != 0 ? DOLLY_PROCESS_DSO_GLOBAL : 0,
      0,
      image_size,
  };
  memcpy(packet, &request, sizeof(request));
  size_t offset = sizeof(request);
  while (offset < packet_size) {
    ssize_t count = read(descriptor, packet + offset, packet_size - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) {
      const int error = count == 0 ? EIO : errno;
      close(descriptor);
      free(packet);
      set_dso_error(NULL, error);
      errno = error;
      return NULL;
    }
    offset += (size_t)count;
  }
  if (descriptor >= 0) close(descriptor);
  dolly_process_dso_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_DSO_OPEN, packet, packet_size,
      &response, sizeof(response));
  free(packet);
  if (decode_dso_response(result, &response) != 0 || response.value == 0) {
    if (!dso_error_pending) set_dso_error(NULL, ENOEXEC);
    return NULL;
  }
  return (void *)(uintptr_t)response.value;
}

void *dolly_dlsym(void *handle, const char *name) {
  clear_dso_error();
  if (name == NULL || name[0] == 0) {
    set_dso_error(NULL, EINVAL);
    errno = EINVAL;
    return NULL;
  }
  const size_t name_size = strlen(name);
  if (name_size > UINT32_MAX ||
      name_size > SIZE_MAX - sizeof(dolly_process_dso_symbol_request)) {
    set_dso_error(NULL, E2BIG);
    errno = E2BIG;
    return NULL;
  }
  const size_t packet_size = sizeof(dolly_process_dso_symbol_request) + name_size;
  unsigned char *packet = malloc(packet_size);
  if (packet == NULL) {
    set_dso_error(NULL, ENOMEM);
    return NULL;
  }
  const dolly_process_dso_symbol_request request = {
      (uint64_t)(uintptr_t)handle, (uint32_t)name_size, 0,
  };
  memcpy(packet, &request, sizeof(request));
  memcpy(packet + sizeof(request), name, name_size);
  dolly_process_dso_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_DSO_SYMBOL, packet, packet_size,
      &response, sizeof(response));
  free(packet);
  if (decode_dso_response(result, &response) != 0 || response.value == 0) {
    if (!dso_error_pending) set_dso_error(NULL, ENOENT);
    return NULL;
  }
  return (void *)(uintptr_t)response.value;
}

char *dolly_dlerror(void) {
  if (!dso_error_pending) return NULL;
  dso_error_pending = 0;
  return dso_error;
}

int dolly_dlclose(void *handle) {
  clear_dso_error();
  if (handle == NULL) return 0;
  const dolly_process_dso_close_request request = {
      (uint64_t)(uintptr_t)handle,
  };
  dolly_process_dso_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_DSO_CLOSE, &request, sizeof(request),
      &response, sizeof(response));
  return decode_dso_response(result, &response);
}

/* musl's private file-action record (src/process/fdop.h), built by the pinned
 * libc's posix_spawn_file_actions_* functions; newest first. */
struct fdop {
  struct fdop *next, *prev;
  int cmd, fd, srcfd, oflag;
  mode_t mode;
  char path[];
};
enum { FDOP_DUP2 = 2, FDOP_CHDIR = 4 };

/* A child starts with default dispositions and an empty mask, so a signal the
 * caller blocks or ignores without resetting it cannot be honoured. */
static int spawn_signals_supported(short flags, const posix_spawnattr_t *attributes) {
  sigset_t mask, defaults;
  if (flags & POSIX_SPAWN_SETSIGMASK) posix_spawnattr_getsigmask(attributes, &mask);
  else pthread_sigmask(SIG_BLOCK, NULL, &mask);
  sigemptyset(&defaults);
  if (flags & POSIX_SPAWN_SETSIGDEF) posix_spawnattr_getsigdefault(attributes, &defaults);
  for (int number = 1; number < _NSIG; ++number) {
    if (number == SIGKILL || number == SIGSTOP) continue;
    struct sigaction action;
    if (sigismember(&mask, number) == 1 || sigaction(number, NULL, &action) != 0 ||
        (action.sa_handler == SIG_IGN && sigismember(&defaults, number) != 1)) return 0;
  }
  return 1;
}

/* Dup2 actions replay as parent-to-child descriptor mappings over the
 * inherited non-CLOEXEC set and chdir actions choose the child's directory;
 * other actions and attributes fail with ENOTSUP. */
static int spawn(pid_t *pid, const char *program, const posix_spawn_file_actions_t *actions,
                 const posix_spawnattr_t *attributes, char *const argv[], char *const envp[],
                 int search) {
  const short honored = POSIX_SPAWN_RESETIDS | POSIX_SPAWN_SETSIGDEF |
      POSIX_SPAWN_SETSIGMASK | POSIX_SPAWN_USEVFORK;
  short flags = 0;
  if (attributes != NULL) posix_spawnattr_getflags(attributes, &flags);
  if ((flags & ~honored) != 0 || !spawn_signals_supported(flags, attributes)) return ENOTSUP;
  if (program[0] == '\0') return ENOENT;
  const struct fdop *oldest = NULL;
  size_t count = 0;
  for (const struct fdop *op = actions ? actions->__actions : NULL; op; op = op->next) {
    if (op->cmd != FDOP_DUP2 && op->cmd != FDOP_CHDIR) return ENOTSUP;
    oldest = op;
    ++count;
  }
  dolly_process_fd_mapping *mappings = calloc(count + 1, sizeof(*mappings));
  if (mappings == NULL) return ENOMEM;
  uint32_t mapped = 0;
  char cwd[PATH_MAX], path[PATH_MAX];
  int error = getcwd(cwd, sizeof(cwd)) ? 0 : errno;
  for (const struct fdop *op = oldest; op && error == 0; op = op->prev) {
    if (op->cmd == FDOP_CHDIR) {
      struct stat metadata;
      const int size = op->path[0] == '/' ? snprintf(path, sizeof(path), "%s", op->path)
          : snprintf(path, sizeof(path), "%s/%s", cwd, op->path);
      if (size >= (int)sizeof(path)) error = ENAMETOOLONG;
      else if (!realpath(path, cwd) || stat(cwd, &metadata) != 0) error = errno;
      else if (!S_ISDIR(metadata.st_mode)) error = ENOTDIR;
      continue;
    }
    uint32_t source = (uint32_t)op->srcfd, slot = mapped;
    for (uint32_t index = 0; index < mapped; ++index) {
      if (mappings[index].target_descriptor == (uint32_t)op->srcfd)
        source = mappings[index].source_descriptor;
      if (mappings[index].target_descriptor == (uint32_t)op->fd) slot = index;
    }
    mappings[slot] = (dolly_process_fd_mapping){source, (uint32_t)op->fd};
    if (slot == mapped) ++mapped;
  }
  int argc = 0;
  while (argv[argc] != NULL) ++argc;
  const char *entry = search && !strchr(program, '/') ? getenv("PATH") : NULL;
  if (search && !strchr(program, '/') && entry == NULL) entry = "/bin:/usr/bin";
  while (error == 0) {
    const char *end = entry ? strchr(entry, ':') : NULL;
    const int length = entry ? (int)(end ? (size_t)(end - entry) : strlen(entry)) : 0;
    const int size = entry ? snprintf(path, sizeof(path), "%.*s%s%s", length, entry,
                                      length ? "/" : "", program)
                           : snprintf(path, sizeof(path), "%s", program);
    char absolute[PATH_MAX];
    if (size >= (int)sizeof(path) || (path[0] != '/' &&
        snprintf(absolute, sizeof(absolute), "%s/%s", cwd, path) >= (int)sizeof(absolute))) {
      error = ENAMETOOLONG;
      break;
    }
    const int child = dolly_spawn_mapped(path[0] == '/' ? path : absolute, argc,
        (char **)argv, envp, cwd, DOLLY_PROCESS_INHERIT_FDS_ALL, mappings, mapped, -1);
    if (child > 0) {
      if (pid != NULL) *pid = child;
      break;
    }
    error = -child;
    if (end == NULL || (error != ENOENT && error != ENOTDIR)) break;
    entry = end + 1;
    error = 0;
  }
  free(mappings);
  return error;
}

int posix_spawn(pid_t *restrict pid, const char *restrict path,
                const posix_spawn_file_actions_t *actions,
                const posix_spawnattr_t *restrict attributes,
                char *const argv[restrict], char *const envp[restrict]) {
  return spawn(pid, path, actions, attributes, argv, envp, 0);
}

int posix_spawnp(pid_t *restrict pid, const char *restrict file,
                 const posix_spawn_file_actions_t *actions,
                 const posix_spawnattr_t *restrict attributes,
                 char *const argv[restrict], char *const envp[restrict]) {
  return spawn(pid, file, actions, attributes, argv, envp, 1);
}

int system(const char *command) {
  if (command == NULL) return 1;
  char *arguments[] = {"slop", "-c", (char *)command, NULL};
  const int pid = dolly_spawn(
      "/bin/slop", 3, arguments,
      STDIN_FILENO, STDOUT_FILENO, STDERR_FILENO);
  if (pid < 0) {
    errno = -pid;
    return -1;
  }
  int status;
  return dolly_waitpid(pid, &status, 0) < 0 ? -1 : status;
}

typedef struct {
  FILE *stream;
  int pid;
} process_popen_entry;

static process_popen_entry process_popen_entries[32];
static dolly_lock popen_lock;

static void popen_release(size_t slot) {
  dolly_lock_acquire(&popen_lock);
  process_popen_entries[slot] = (process_popen_entry){0};
  dolly_lock_release(&popen_lock);
}

FILE *popen(const char *command, const char *mode) {
  if (command == NULL || mode == NULL ||
      !((strcmp(mode, "r") == 0 || strcmp(mode, "re") == 0) ||
        (strcmp(mode, "w") == 0 || strcmp(mode, "we") == 0))) {
    errno = EINVAL;
    return NULL;
  }
  dolly_lock_acquire(&popen_lock);
  size_t slot = 0;
  while (slot < sizeof(process_popen_entries) /
                    sizeof(process_popen_entries[0]) &&
         process_popen_entries[slot].pid != 0) ++slot;
  if (slot == sizeof(process_popen_entries) /
              sizeof(process_popen_entries[0])) {
    errno = EMFILE;
    dolly_lock_release(&popen_lock);
    return NULL;
  }
  process_popen_entries[slot].pid = -1;
  dolly_lock_release(&popen_lock);
  int descriptors[2];
  if (pipe(descriptors) != 0) { popen_release(slot); return NULL; }
  const int reading = mode[0] == 'r';
  char *arguments[] = {"slop", "-c", (char *)command, NULL};
  const int pid = dolly_spawn(
      "/bin/slop", 3, arguments,
      reading ? STDIN_FILENO : descriptors[0],
      reading ? descriptors[1] : STDOUT_FILENO,
      STDERR_FILENO);
  close(reading ? descriptors[1] : descriptors[0]);
  if (pid < 0) {
    popen_release(slot);
    close(reading ? descriptors[0] : descriptors[1]);
    errno = -pid;
    return NULL;
  }
  const int parent_descriptor = reading ? descriptors[0] : descriptors[1];
  FILE *stream = fdopen(parent_descriptor, reading ? "r" : "w");
  if (stream == NULL) {
    popen_release(slot);
    close(parent_descriptor);
    int ignored = 0;
    (void)dolly_wait(pid, &ignored);
    return NULL;
  }
  dolly_lock_acquire(&popen_lock);
  process_popen_entries[slot] = (process_popen_entry){stream, pid};
  dolly_lock_release(&popen_lock);
  return stream;
}

int pclose(FILE *stream) {
  if (stream == NULL) {
    errno = EINVAL;
    return -1;
  }
  dolly_lock_acquire(&popen_lock);
  size_t slot = 0;
  while (slot < sizeof(process_popen_entries) /
                    sizeof(process_popen_entries[0]) &&
         process_popen_entries[slot].stream != stream) ++slot;
  if (slot == sizeof(process_popen_entries) /
              sizeof(process_popen_entries[0])) {
    errno = ECHILD;
    dolly_lock_release(&popen_lock);
    return -1;
  }
  const int pid = process_popen_entries[slot].pid;
  process_popen_entries[slot] = (process_popen_entry){0};
  dolly_lock_release(&popen_lock);
  const int close_result = fclose(stream);
  int status;
  const pid_t waited = dolly_waitpid(pid, &status, 0);
  return close_result != 0 || waited < 0 ? -1 : status;
}
