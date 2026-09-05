#define _GNU_SOURCE

#include <dolly/display.h>
#include <dolly/http.h>
#include <dolly/download.h>
#include <dolly/process.h>
#include <dolly/runtime.h>
#include <dolly/toolchain.h>

#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <netdb.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/random.h>
#include <time.h>
#include <unistd.h>

extern char **environ;

static uint64_t monotonic_nanoseconds(void) {
  struct timespec value;
  return clock_gettime(CLOCK_MONOTONIC, &value) == 0
      ? (uint64_t)value.tv_sec * 1000000000u + (uint64_t)value.tv_nsec : 0;
}

static int append_http_text(char **target, size_t *length,
                            const unsigned char *bytes, size_t count) {
  if (count > SIZE_MAX - *length - 1) return -EOVERFLOW;
  char *grown = realloc(*target, *length + count + 1);
  if (grown == NULL) return -ENOMEM;
  memcpy(grown + *length, bytes, count);
  *length += count;
  grown[*length] = 0;
  *target = grown;
  return 0;
}

int dolly_http_start(const char *method, const char *url, const char *headers,
                     const void *body, size_t body_size, unsigned int flags,
                     unsigned int *sequence) {
  if (method == NULL || url == NULL || sequence == NULL ||
      method[0] == 0 || url[0] == 0 || (body_size != 0 && body == NULL)) {
    return -EINVAL;
  }
  if (headers == NULL) headers = "";
  const size_t method_size = strlen(method);
  const size_t url_size = strlen(url);
  const size_t headers_size = strlen(headers);
  if (method_size > UINT32_MAX || url_size > UINT32_MAX ||
      headers_size > UINT32_MAX ||
      method_size > DOLLY_PROCESS_PACKET_LIMIT -
          sizeof(dolly_process_http_start_request) ||
      url_size > DOLLY_PROCESS_PACKET_LIMIT -
          sizeof(dolly_process_http_start_request) - method_size ||
      headers_size > DOLLY_PROCESS_PACKET_LIMIT -
          sizeof(dolly_process_http_start_request) - method_size - url_size ||
      body_size > DOLLY_PROCESS_PACKET_LIMIT -
          sizeof(dolly_process_http_start_request) - method_size - url_size -
          headers_size) return -E2BIG;
  const size_t packet_size = sizeof(dolly_process_http_start_request) +
      method_size + url_size + headers_size + body_size;
  unsigned char *packet = malloc(packet_size);
  if (packet == NULL) return -ENOMEM;
  const dolly_process_http_start_request request = {
      flags, (uint32_t)method_size, (uint32_t)url_size,
      (uint32_t)headers_size, body_size,
  };
  memcpy(packet, &request, sizeof(request));
  size_t offset = sizeof(request);
  memcpy(packet + offset, method, method_size);
  offset += method_size;
  memcpy(packet + offset, url, url_size);
  offset += url_size;
  memcpy(packet + offset, headers, headers_size);
  offset += headers_size;
  if (body_size != 0) memcpy(packet + offset, body, body_size);
  dolly_process_http_start_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_HTTP_START, packet, packet_size,
      &response, sizeof(response));
  free(packet);
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(response) || response.sequence == 0 ||
      response.reserved != 0) return -EIO;
  *sequence = response.sequence;
  return 0;
}

int dolly_http_poll(unsigned int sequence, dolly_http_chunk *chunk,
                    void *data, size_t capacity) {
  if (sequence == 0 || chunk == NULL || (capacity != 0 && data == NULL) ||
      capacity > DOLLY_PROCESS_PACKET_LIMIT -
          sizeof(dolly_process_http_poll_response)) return -EINVAL;
  const dolly_process_http_poll_request request = {sequence, 0};
  const size_t response_capacity =
      sizeof(dolly_process_http_poll_response) + capacity;
  unsigned char *packet = malloc(response_capacity);
  if (packet == NULL) return -ENOMEM;
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_HTTP_POLL, &request, sizeof(request),
      packet, response_capacity);
  if (result < 0) {
    free(packet);
    return (int)result;
  }
  dolly_process_http_poll_response response;
  if ((uint64_t)result < sizeof(response)) {
    free(packet);
    return -EIO;
  }
  memcpy(&response, packet, sizeof(response));
  if (response.ready != 1 || response.reserved != 0 ||
      response.length > capacity ||
      (uint64_t)result != sizeof(response) + response.length) {
    free(packet);
    return -EIO;
  }
  chunk->status = response.status;
  chunk->kind = response.kind;
  chunk->error = response.error;
  chunk->eof = response.eof;
  chunk->length = response.length;
  if (response.length != 0) {
    memcpy(data, packet + sizeof(response), (size_t)response.length);
  }
  free(packet);
  return 1;
}

int dolly_http_cancel(unsigned int sequence) {
  const dolly_process_http_cancel_request request = {sequence, 0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_HTTP_CANCEL, &request, sizeof(request), NULL, 0);
  return result < 0 ? (int)result : result == 0 ? 0 : -EIO;
}

int dolly_http_perform(const dolly_http_request *request,
                       dolly_http_response *response) {
  if (request == NULL || response == NULL) return -EINVAL;
  response->status = 0;
  response->effective_url = NULL;
  size_t effective_url_length = 0;
  unsigned char *data = malloc(DOLLY_HTTP_CHUNK_CAPACITY);
  if (data == NULL) return -ENOMEM;
  unsigned int sequence = 0;
  int result = dolly_http_start(
      request->method, request->url, request->headers, request->body,
      request->body_size, request->flags, &sequence);
  if (result != 0) {
    free(data);
    return result;
  }
  for (;;) {
    dolly_http_chunk chunk = {0};
    const int polled = dolly_http_poll(
        sequence, &chunk, data, DOLLY_HTTP_CHUNK_CAPACITY);
    if (polled < 0 && result == 0) result = polled;
    if (polled < 0) {
      (void)dolly_http_cancel(sequence);
      break;
    }
    response->status = chunk.status;
    if (chunk.error != 0 && result == 0) {
      result = chunk.error == 2 ? -EACCES :
               chunk.error == 3 ? -EPROTONOSUPPORT : -EIO;
    }
    if ((request->flags & DOLLY_HTTP_FAIL_STATUS) != 0 &&
        chunk.status >= 400 && result == 0) result = (int)chunk.status;
    if (result == 0 && chunk.kind == 1) {
      result = append_http_text(&response->effective_url,
                                &effective_url_length,
                                data, chunk.length);
    } else if (result == 0 && chunk.kind == 2 && request->header != NULL) {
      if (request->header(data, chunk.length,
                          request->header_context) != chunk.length) {
        result = -ECANCELED;
      }
    } else if (result == 0 && chunk.kind == 3 && request->write != NULL) {
      if (request->write(data, chunk.length,
                         request->write_context) != chunk.length) {
        result = -ECANCELED;
      }
    }
    if (chunk.eof) break;
  }
  free(data);
  if (result != 0) dolly_http_response_dispose(response);
  return result;
}

void dolly_http_response_dispose(dolly_http_response *response) {
  if (response == NULL) return;
  free(response->effective_url);
  response->effective_url = NULL;
  response->status = 0;
}

static unsigned char *display_pixels;
static size_t display_pixels_capacity;
static uint64_t display_frame_generation;
static size_t display_frame_size;
static uint32_t display_frame_index;

static int decode_display_surface(
    int64_t result, const dolly_process_display_surface_response *response,
    dolly_display_surface *surface) {
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(*response) || response->reserved != 0 ||
      response->generation == 0 || response->width == 0 ||
      response->height == 0 || response->stride != response->width * 4u ||
      response->pixel_format != DOLLY_DISPLAY_PIXEL_RGBA8 ||
      response->width > DOLLY_DISPLAY_MAX_WIDTH ||
      response->height > DOLLY_DISPLAY_MAX_HEIGHT ||
      (uint64_t)response->stride * response->height >
          (uint64_t)DOLLY_DISPLAY_MAX_WIDTH * DOLLY_DISPLAY_MAX_HEIGHT * 4u) {
    return -EIO;
  }
  *surface = (dolly_display_surface){
      .generation = response->generation,
      .width = response->width,
      .height = response->height,
      .stride = response->stride,
      .pixel_format = response->pixel_format,
  };
  return 0;
}

static int display_deadline(double timeout_milliseconds, uint64_t *deadline) {
  if (deadline == NULL || timeout_milliseconds != timeout_milliseconds) {
    return -EINVAL;
  }
  if (timeout_milliseconds < 0) {
    *deadline = UINT64_MAX;
    return 0;
  }
  if (timeout_milliseconds == 0) {
    *deadline = 0;
    return 0;
  }
  const uint64_t now = monotonic_nanoseconds();
  const double delta = timeout_milliseconds * 1000000.0;
  if (now == 0 || delta < 0 || delta > (double)(UINT64_MAX - now)) {
    return -EINVAL;
  }
  *deadline = now + (uint64_t)delta;
  return 0;
}

int dolly_display_acquire(dolly_display_surface *surface) {
  if (surface == NULL) return -EINVAL;
  memset(surface, 0, sizeof(*surface));
  dolly_process_display_surface_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_DISPLAY_ACQUIRE, NULL, 0, &response, sizeof(response));
  return decode_display_surface(result, &response, surface);
}

int dolly_display_set_size(uint64_t generation, uint32_t width,
                           uint32_t height, dolly_display_surface *surface) {
  if (surface == NULL || generation == 0 || width == 0 || height == 0) {
    return -EINVAL;
  }
  const dolly_process_display_size_request request = {
      generation, width, height,
  };
  dolly_process_display_surface_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_DISPLAY_SET_SIZE, &request, sizeof(request),
      &response, sizeof(response));
  return decode_display_surface(result, &response, surface);
}

int dolly_display_begin_frame(uint64_t generation, dolly_display_frame *frame) {
  if (generation == 0 || frame == NULL) return -EINVAL;
  memset(frame, 0, sizeof(*frame));
  const dolly_process_display_generation_request request = {generation};
  dolly_process_display_surface_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_DISPLAY_BEGIN_FRAME, &request, sizeof(request),
      &response, sizeof(response));
  dolly_display_surface surface;
  int status = decode_display_surface(result, &response, &surface);
  if (status != 0) return status;
  const uint64_t expected = (uint64_t)surface.stride * surface.height;
  if (response.capacity != expected || response.capacity > SIZE_MAX ||
      response.buffer_index >= DOLLY_DISPLAY_FRAME_COUNT) return -EIO;
  if ((size_t)response.capacity > display_pixels_capacity) {
    unsigned char *replacement = realloc(display_pixels, (size_t)response.capacity);
    if (replacement == NULL) return -ENOMEM;
    display_pixels = replacement;
    display_pixels_capacity = (size_t)response.capacity;
  }
  display_frame_generation = generation;
  display_frame_size = (size_t)response.capacity;
  display_frame_index = response.buffer_index;
  *frame = (dolly_display_frame){
      .pixels = display_pixels,
      .capacity = display_frame_size,
      .buffer_index = response.buffer_index,
      .width = surface.width,
      .height = surface.height,
      .stride = surface.stride,
      .pixel_format = surface.pixel_format,
  };
  return 0;
}

int dolly_display_present(uint64_t generation, uint32_t buffer_index) {
  if (generation == 0 || generation != display_frame_generation ||
      buffer_index != display_frame_index || display_frame_size == 0 ||
      display_pixels == NULL) return -EINVAL;
  const size_t header_size = sizeof(dolly_process_display_write_request);
  const size_t maximum_chunk = DOLLY_PROCESS_PACKET_LIMIT - header_size;
  unsigned char *packet = malloc(DOLLY_PROCESS_PACKET_LIMIT);
  if (packet == NULL) return -ENOMEM;
  size_t offset = 0;
  int status = 0;
  while (offset < display_frame_size) {
    const size_t chunk = display_frame_size - offset > maximum_chunk
        ? maximum_chunk : display_frame_size - offset;
    const dolly_process_display_write_request request = {
        .generation = generation,
        .offset = offset,
        .size = chunk,
        .buffer_index = buffer_index,
    };
    memcpy(packet, &request, sizeof(request));
    memcpy(packet + header_size, display_pixels + offset, chunk);
    const int64_t result = dolly_process_call(
        DOLLY_PROCESS_DISPLAY_WRITE_FRAME, packet, header_size + chunk,
        NULL, 0);
    if (result < 0) {
      status = (int)result;
      break;
    }
    if (result != 0) {
      status = -EIO;
      break;
    }
    offset += chunk;
  }
  free(packet);
  if (status != 0) return status;
  const dolly_process_display_present_request request = {
      generation, buffer_index, 0,
  };
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_DISPLAY_PRESENT, &request, sizeof(request), NULL, 0);
  if (result < 0) return (int)result;
  if (result != 0) return -EIO;
  display_frame_generation = 0;
  display_frame_size = 0;
  return 0;
}

int dolly_display_wait_frame(uint64_t generation, uint32_t *sequence,
                             double timeout_milliseconds) {
  if (generation == 0 || sequence == NULL) return -EINVAL;
  uint64_t deadline;
  int status = display_deadline(timeout_milliseconds, &deadline);
  if (status != 0) return status;
  const dolly_process_display_wait_request request = {
      generation, deadline, *sequence, 0,
  };
  dolly_process_display_wait_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_DISPLAY_WAIT_FRAME, &request, sizeof(request),
      &response, sizeof(response));
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(response) ||
      (response.result != 0 && response.result != 1)) return -EIO;
  *sequence = response.sequence;
  return response.result;
}

int dolly_display_set_cursor(uint64_t generation, uint32_t cursor) {
  const dolly_process_display_cursor_request request = {generation, cursor, 0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_DISPLAY_SET_CURSOR, &request, sizeof(request), NULL, 0);
  return result < 0 ? (int)result : result == 0 ? 0 : -EIO;
}

int dolly_display_next_event(uint64_t generation, dolly_input_event *event,
                             double timeout_milliseconds) {
  if (generation == 0 || event == NULL) return -EINVAL;
  uint64_t deadline;
  int status = display_deadline(timeout_milliseconds, &deadline);
  if (status != 0) return status;
  const dolly_process_display_event_request request = {generation, deadline};
  dolly_process_display_event_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_DISPLAY_NEXT_EVENT, &request, sizeof(request),
      &response, sizeof(response));
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(response) || response.reserved != 0 ||
      (response.result != 0 && response.result != 1)) return -EIO;
  _Static_assert(sizeof(response.event) == sizeof(*event),
                 "process/display event layouts diverged");
  if (response.result == 1) memcpy(event, response.event, sizeof(*event));
  return response.result;
}

int dolly_display_release(uint64_t generation) {
  const dolly_process_display_generation_request request = {generation};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_DISPLAY_RELEASE, &request, sizeof(request), NULL, 0);
  if (result < 0) return (int)result;
  if (result != 0) return -EIO;
  display_frame_generation = 0;
  display_frame_size = 0;
  return 0;
}

static int spawn_process(const char *path, int argc, char **argv,
                         char *const envp[], int stdin_fd, int stdout_fd,
                         int stderr_fd, double timeout_milliseconds) {
  if (path == NULL || argv == NULL || argc <= 0 ||
      timeout_milliseconds != timeout_milliseconds) return -EINVAL;
  const size_t path_size = strlen(path);
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
      path_size + argument_bytes + environment_bytes;
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
      envp == NULL ? DOLLY_PROCESS_SPAWN_INHERIT_ENVIRONMENT : 0,
      (uint32_t)argc,
      environment_count,
      0,
      (uint32_t)stdin_fd,
      (uint32_t)stdout_fd,
      (uint32_t)stderr_fd,
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
  dolly_process_spawn_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_SPAWN, packet, packet_size, &response, sizeof(response));
  free(packet);
  if (result < 0) return (int)result;
  return (uint64_t)result == sizeof(response) && response.reserved == 0 &&
      response.pid <= INT32_MAX ? (int)response.pid : -EIO;
}

int dolly_spawn(const char *path, int argc, char **argv,
                int stdin_fd, int stdout_fd, int stderr_fd) {
  return spawn_process(path, argc, argv, environ,
                       stdin_fd, stdout_fd, stderr_fd, -1);
}

int dolly_spawn_timeout(const char *path, int argc, char **argv,
                        int stdin_fd, int stdout_fd, int stderr_fd,
                        double timeout_milliseconds) {
  if (timeout_milliseconds < 0 || timeout_milliseconds > 86400000.0) {
    return -EINVAL;
  }
  return spawn_process(path, argc, argv, environ, stdin_fd, stdout_fd, stderr_fd,
                       timeout_milliseconds);
}

int dolly_spawn_env(const char *path, int argc, char **argv, char *const envp[],
                    int stdin_fd, int stdout_fd, int stderr_fd) {
  return spawn_process(path, argc, argv, envp,
                       stdin_fd, stdout_fd, stderr_fd, -1);
}

int dolly_spawn_env_timeout(const char *path, int argc, char **argv,
                            char *const envp[], int stdin_fd, int stdout_fd,
                            int stderr_fd, double timeout_milliseconds) {
  if (timeout_milliseconds < 0 || timeout_milliseconds > 86400000.0) {
    return -EINVAL;
  }
  return spawn_process(path, argc, argv, envp, stdin_fd, stdout_fd, stderr_fd,
                       timeout_milliseconds);
}

int dolly_wait(int pid, int *status) {
  if (pid <= 0 || status == NULL) return -EINVAL;
  const dolly_process_wait_request request = {(uint32_t)pid, 0};
  dolly_process_wait_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_WAIT, &request, sizeof(request),
      &response, sizeof(response));
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(response) || response.reserved != 0 ||
      response.status > 255) return -EIO;
  *status = (int)response.status;
  return 0;
}

int dolly_toolchain_proxy(int argc, char **argv, int default_language) {
  static const char *const modes[] = {
      "--dolly-toolchain-mode=c",
      "--dolly-toolchain-mode=c++",
      "--dolly-toolchain-mode=ld",
      "--dolly-toolchain-mode=ar",
      "--dolly-toolchain-mode=zig",
  };
  if (argc <= 0 || argv == NULL || argv[0] == NULL ||
      default_language < DOLLY_TOOLCHAIN_C ||
      default_language > DOLLY_TOOLCHAIN_ZIG || argc == INT32_MAX) return 64;
  char **forward = calloc((size_t)argc + 2, sizeof(*forward));
  if (forward == NULL) return 1;
  forward[0] = argv[0];
  forward[1] = (char *)modes[default_language];
  for (int index = 1; index < argc; ++index) forward[index + 1] = argv[index];
  int status = 126;
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

int dolly_atexit(void (*callback)(void)) {
  if (callback == NULL) {
    errno = EINVAL;
    return -1;
  }
  return atexit(callback);
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

char *getpass(const char *prompt) { return dolly_getpass(prompt); }

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

int dolly_socket(int domain, int type, int protocol) {
  return socket(domain, type, protocol);
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

int dolly_connect(int descriptor, const struct sockaddr *address,
                  socklen_t address_length) {
  return connect(descriptor, address, address_length);
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

ssize_t dolly_recv(int descriptor, void *buffer, size_t length, int flags) {
  return recv(descriptor, buffer, length, flags);
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

int dolly_setsockopt(int descriptor, int level, int option, const void *value,
                     socklen_t value_length) {
  return setsockopt(descriptor, level, option, value, value_length);
}

int shutdown(int descriptor, int how) {
  (void)descriptor;
  (void)how;
  return raw_socket_unavailable();
}

int dolly_shutdown(int descriptor, int how) {
  return shutdown(descriptor, how);
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

struct hostent *dolly_gethostbyname(const char *name) {
  return gethostbyname(name);
}

struct servent *getservbyname(const char *name, const char *protocol) {
  (void)name;
  (void)protocol;
  h_errno = HOST_NOT_FOUND;
  return NULL;
}

struct servent *dolly_getservbyname(const char *name, const char *protocol) {
  return getservbyname(name, protocol);
}

int dolly_execve(const char *path, char *const argv[], char *const envp[]) {
  if (path == NULL || argv == NULL || argv[0] == NULL) {
    errno = EFAULT;
    return -1;
  }
  int argc = 0;
  while (argv[argc] != NULL) {
    if (argc == INT_MAX) {
      errno = E2BIG;
      return -1;
    }
    ++argc;
  }
  const int pid = dolly_spawn_env(path, argc, (char **)argv, envp,
                                  STDIN_FILENO, STDOUT_FILENO, STDERR_FILENO);
  if (pid < 0) {
    errno = -pid;
    return -1;
  }
  int status = 126;
  const int waited = dolly_wait(pid, &status);
  if (waited != 0) {
    errno = -waited;
    return -1;
  }
  dolly_exit(status);
}

pid_t dolly_waitpid(pid_t pid, int *status, int options) {
  if (pid <= 0 || options != 0) {
    errno = options == 0 ? ECHILD : ENOTSUP;
    return -1;
  }
  int exit_status = 0;
  const int result = dolly_wait(pid, &exit_status);
  if (result != 0) {
    errno = -result;
    return -1;
  }
  if (status != NULL) *status = exit_status << 8;
  return pid;
}

int dolly_kill(pid_t pid, int signal_number) {
  (void)pid;
  (void)signal_number;
  errno = ENOSYS;
  return -1;
}

unsigned dolly_alarm(unsigned seconds) {
  (void)seconds;
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
  return result == sizeof(response) ? response : 0;
}

void dolly_interrupt_checkpoint(void) {
  if (dolly_interrupt_poll() != 0) dolly_exit(130);
}

void dolly_exit(int status) {
  const dolly_process_exit_request request = {(uint32_t)(status & 255), 0};
  (void)dolly_process_call(DOLLY_PROCESS_EXIT, &request, sizeof(request), NULL, 0);
  __builtin_trap();
}

int dolly_fclose(FILE *stream) { return fclose(stream); }

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

int dolly_download_file(const char *path) {
  if (path == NULL) return -EFAULT;
  const size_t path_size = strnlen(path, PATH_MAX + 1u);
  if (path_size == 0) return -ENOENT;
  if (path_size > PATH_MAX) return -ENAMETOOLONG;
  const size_t packet_size = sizeof(dolly_process_path_request) + path_size;
  unsigned char *packet = malloc(packet_size);
  if (packet == NULL) return -ENOMEM;
  const dolly_process_path_request request = {
      .directory_descriptor = UINT32_MAX,
      .path_size = (uint32_t)path_size,
  };
  memcpy(packet, &request, sizeof(request));
  memcpy(packet + sizeof(request), path, path_size);
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_DOWNLOAD_FILE, packet, packet_size, NULL, 0);
  free(packet);
  return result < 0 ? (int)result : result == 0 ? 0 : -EIO;
}

static char dso_error[DOLLY_PROCESS_DSO_ERROR_CAPACITY + 1];
static int dso_error_pending;

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
  int status = 126;
  const int result = dolly_wait(pid, &status);
  if (result != 0) {
    errno = -result;
    return -1;
  }
  return status << 8;
}

int dolly_system(const char *command) { return system(command); }

typedef struct {
  FILE *stream;
  int pid;
} process_popen_entry;

static process_popen_entry process_popen_entries[32];

FILE *popen(const char *command, const char *mode) {
  if (command == NULL || mode == NULL ||
      !((strcmp(mode, "r") == 0 || strcmp(mode, "re") == 0) ||
        (strcmp(mode, "w") == 0 || strcmp(mode, "we") == 0))) {
    errno = EINVAL;
    return NULL;
  }
  size_t slot = 0;
  while (slot < sizeof(process_popen_entries) /
                    sizeof(process_popen_entries[0]) &&
         process_popen_entries[slot].stream != NULL) ++slot;
  if (slot == sizeof(process_popen_entries) /
              sizeof(process_popen_entries[0])) {
    errno = EMFILE;
    return NULL;
  }
  int descriptors[2];
  if (pipe(descriptors) != 0) return NULL;
  const int reading = mode[0] == 'r';
  char *arguments[] = {"slop", "-c", (char *)command, NULL};
  const int pid = dolly_spawn(
      "/bin/slop", 3, arguments,
      reading ? STDIN_FILENO : descriptors[0],
      reading ? descriptors[1] : STDOUT_FILENO,
      STDERR_FILENO);
  close(reading ? descriptors[1] : descriptors[0]);
  if (pid < 0) {
    close(reading ? descriptors[0] : descriptors[1]);
    errno = -pid;
    return NULL;
  }
  const int parent_descriptor = reading ? descriptors[0] : descriptors[1];
  FILE *stream = fdopen(parent_descriptor, reading ? "r" : "w");
  if (stream == NULL) {
    close(parent_descriptor);
    int ignored = 0;
    (void)dolly_wait(pid, &ignored);
    return NULL;
  }
  process_popen_entries[slot] = (process_popen_entry){stream, pid};
  return stream;
}

FILE *dolly_popen(const char *command, const char *mode) {
  return popen(command, mode);
}

int pclose(FILE *stream) {
  if (stream == NULL) {
    errno = EINVAL;
    return -1;
  }
  size_t slot = 0;
  while (slot < sizeof(process_popen_entries) /
                    sizeof(process_popen_entries[0]) &&
         process_popen_entries[slot].stream != stream) ++slot;
  if (slot == sizeof(process_popen_entries) /
              sizeof(process_popen_entries[0])) {
    errno = ECHILD;
    return -1;
  }
  const int pid = process_popen_entries[slot].pid;
  process_popen_entries[slot] = (process_popen_entry){0};
  const int close_result = fclose(stream);
  int status = 126;
  const int wait_result = dolly_wait(pid, &status);
  if (close_result != 0) return -1;
  if (wait_result != 0) {
    errno = -wait_result;
    return -1;
  }
  return status << 8;
}

int dolly_pclose(FILE *stream) { return pclose(stream); }
