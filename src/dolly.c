#include <errno.h>
#include <dirent.h>
#include <dlfcn.h>
#include <fcntl.h>
#include <limits.h>
#include <sched.h>
#include <stddef.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include <emscripten/atomic.h>
#include <emscripten/emscripten.h>
#include <emscripten/wasmfs.h>

#include <dolly/display.h>
#include <dolly/http.h>

#include "dolly-runtime.h"
#include "process-kernel.h"
#include "session-snapshot.h"
#include "system-snapshot.h"

// musl exposes CPU_COUNT_S through this out-of-line helper, but Emscripten's
// non-pthread main-module link does not retain a definition for it. Keep the
// result deterministic and wholly in-Wasm: Dolly currently advertises one
// serialized execution context through sched_getaffinity().
int __sched_cpucount(size_t size, const void *set) {
  if (set == NULL) return 0;
  const unsigned char *bytes = (const unsigned char *)set;
  int count = 0;
  for (size_t index = 0; index < size; ++index) {
    unsigned char value = bytes[index];
    while (value != 0) {
      count += value & 1u;
      value >>= 1;
    }
  }
  return count;
}

int sched_getaffinity(pid_t pid, size_t size, void *set) {
  if (set == NULL || size == 0) {
    errno = EINVAL;
    return -1;
  }
  if (pid != 0 && pid != getpid()) {
    errno = ESRCH;
    return -1;
  }
  memset(set, 0, size);
  ((unsigned char *)set)[0] = 1;
  return 0;
}

static uint32_t consumed_interrupt_sequence;
static uint32_t active_terminal_mask = 0x7u;
static uint32_t terminal_mode_flags =
    DOLLY_TERMINAL_CANONICAL | DOLLY_TERMINAL_ECHO;

_Static_assert((DOLLY_DISPLAY_EVENT_CAPACITY &
                (DOLLY_DISPLAY_EVENT_CAPACITY - 1)) == 0,
               "display event capacity must be a power of two");

_Alignas(64) static dolly_display_mailbox display_mailbox;
static const dolly_display_driver_v3 *display_driver;
static void *display_module;
static unsigned char *display_frames[DOLLY_DISPLAY_FRAME_COUNT];
_Alignas(64) static unsigned char
    display_paste_buffer[DOLLY_DISPLAY_CLIPBOARD_CAPACITY];
_Alignas(64) static unsigned char
    display_copy_buffer[DOLLY_DISPLAY_CLIPBOARD_CAPACITY];
static const size_t display_frame_capacity =
    (size_t)DOLLY_DISPLAY_MAX_WIDTH * DOLLY_DISPLAY_MAX_HEIGHT * 4;

typedef struct {
  uint64_t generation;
  int owner_pid;
  uint32_t width;
  uint32_t height;
  uint32_t stride;
  uint32_t staging_buffer;
  size_t staging_offset;
  int staging;
} dolly_display_lease;

static dolly_display_lease display_lease;
static uint64_t next_display_generation = 1;

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

static unsigned char encoded_input[256];
static size_t encoded_input_length;
static size_t encoded_input_cursor;
static unsigned char cooked_line[4096];
static size_t cooked_length;
static size_t cooked_cursor;
static int cooked_boundary;

static int update_suspended_terminal_layout(const dolly_input_event *event);

static int validate_display_lease(int owner_pid, uint64_t generation) {
  if (generation == 0 || display_lease.generation != generation) {
    return -ESTALE;
  }
  if (owner_pid <= 0 || owner_pid != display_lease.owner_pid) {
    return -EPERM;
  }
  return 0;
}

static void release_display_lease_for_pid(int owner_pid) {
  if (display_lease.generation == 0 || display_lease.owner_pid != owner_pid) {
    return;
  }
  display_lease.generation = 0;
  display_lease.owner_pid = 0;
  display_lease.width = 0;
  display_lease.height = 0;
  display_lease.stride = 0;
  display_lease.staging_buffer = 0;
  display_lease.staging_offset = 0;
  display_lease.staging = 0;
  // Events already published while the graphics owner was active belong to
  // that ownership epoch and must not leak into the restored shell. Preserve
  // only layout changes so Ghostty returns at the current canvas size.
  uint32_t read = atomic_load_explicit(&display_mailbox.event_read,
                                       memory_order_relaxed);
  const uint32_t write = atomic_load_explicit(&display_mailbox.event_write,
                                               memory_order_acquire);
  while (read != write) {
    const dolly_input_event event =
        display_mailbox.events[read & (DOLLY_DISPLAY_EVENT_CAPACITY - 1)];
    ++read;
    atomic_store_explicit(&display_mailbox.event_read, read,
                          memory_order_release);
    if (event.type == DOLLY_INPUT_EVENT_RESIZE) {
      (void)update_suspended_terminal_layout(&event);
    }
  }
  const uint32_t paste_sequence = atomic_load_explicit(
      &display_mailbox.paste_sequence, memory_order_acquire);
  atomic_store_explicit(&display_mailbox.paste_consumed_sequence,
                        paste_sequence, memory_order_release);
  encoded_input_cursor = 0;
  encoded_input_length = 0;
  dolly_terminal_reset_cooked();
  if (display_driver != NULL) display_driver->set_suspended(0);
  atomic_store_explicit(&display_mailbox.cursor_style,
                        DOLLY_DISPLAY_CURSOR_TEXT, memory_order_release);
  atomic_fetch_and_explicit(&display_mailbox.flags,
                            ~((uint32_t)DOLLY_DISPLAY_GRAPHICS_ACTIVE),
                            memory_order_release);
}

EM_JS(void, dolly_bootstrap_write_bytes,
      (const unsigned char *bytes, uintptr_t length), {
  const start = Number(bytes);
  Module["bootstrapWriteBytes"]?.(HEAPU8.slice(start, start + Number(length)));
});

EM_JS(void, dolly_http_dispatch,
      (const char *method, const char *url, const char *headers,
       const void *body, uintptr_t body_size, uint32_t flags,
       uint32_t sequence), {
  if (!method) {
    Module["httpCancel"]?.(sequence);
    return;
  }
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

EM_JS(int, dolly_download_dispatch,
      (const unsigned char *name, uintptr_t name_length,
       const unsigned char *bytes, uintptr_t length), {
  const nameStart = Number(name);
  const nameSize = Number(name_length);
  const dataStart = Number(bytes);
  const dataSize = Number(length);
  const maximum = 64 * 1024 * 1024;
  if (!Number.isSafeInteger(nameStart) || !Number.isSafeInteger(nameSize) ||
      !Number.isSafeInteger(dataStart) || !Number.isSafeInteger(dataSize) ||
      nameStart < 0 || nameSize < 1 || nameSize > 255 ||
      dataStart < 0 || dataSize < 0 || dataSize > maximum ||
      nameStart + nameSize > HEAPU8.length ||
      dataStart + dataSize > HEAPU8.length) return -22;
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      HEAPU8.slice(nameStart, nameStart + nameSize),
    );
  } catch (_) {
    return -22;
  }
  if (decoded === "." || decoded === "..") return -22;
  for (let index = 0; index < decoded.length; index += 1) {
    const code = decoded.charCodeAt(index);
    if (code === 47 || code === 92 || code < 32 || code === 127) return -22;
  }
  const dispatch = Module["downloadDispatch"];
  if (typeof dispatch !== "function") return -38;
  return dispatch({
    name: decoded,
    bytes: HEAPU8.slice(dataStart, dataStart + dataSize),
  }) | 0;
});

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_display_mailbox_address(void) {
  return (uintptr_t)&display_mailbox;
}

EMSCRIPTEN_KEEPALIVE
uint32_t dolly_display_mailbox_version(void) {
  return DOLLY_DISPLAY_MAILBOX_VERSION;
}

EMSCRIPTEN_KEEPALIVE
uint32_t dolly_display_event_size(void) {
  return DOLLY_DISPLAY_EVENT_SIZE;
}

EMSCRIPTEN_KEEPALIVE
uint32_t dolly_display_event_capacity(void) {
  return DOLLY_DISPLAY_EVENT_CAPACITY;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_display_framebuffer_address(uint32_t index) {
  return index < DOLLY_DISPLAY_FRAME_COUNT
      ? (uintptr_t)display_frames[index] : 0;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_display_framebuffer_capacity(void) {
  return display_frame_capacity;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_display_paste_buffer_address(void) {
  return (uintptr_t)display_paste_buffer;
}

EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_display_copy_buffer_address(void) {
  return (uintptr_t)display_copy_buffer;
}

EMSCRIPTEN_KEEPALIVE
uint32_t dolly_display_clipboard_capacity(void) {
  return DOLLY_DISPLAY_CLIPBOARD_CAPACITY;
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

int dolly_http_start(const char *method, const char *url, const char *headers,
                     const void *body, size_t body_size, unsigned int flags,
                     unsigned int *sequence_out) {
  const unsigned int valid_flags =
      DOLLY_HTTP_FAIL_STATUS | DOLLY_HTTP_FOLLOW_REDIRECTS;
  if (method == NULL || url == NULL || sequence_out == NULL ||
      method[0] == '\0' || url[0] == '\0' || (flags & ~valid_flags) != 0 ||
      (body_size != 0 && body == NULL)) return -EINVAL;

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
  dolly_http_dispatch(method, url, headers == NULL ? "" : headers,
                      body, body_size, flags, sequence);
  *sequence_out = sequence;
  return 0;
}

int dolly_http_poll(unsigned int sequence, dolly_http_chunk *chunk,
                    void *data, size_t capacity) {
  if (chunk == NULL || (capacity != 0 && data == NULL)) return -EINVAL;
  if (atomic_load_explicit(&http_mailbox.sequence, memory_order_acquire) !=
      sequence) return -ESTALE;
  if (atomic_load_explicit(&http_mailbox.state, memory_order_acquire) != 2) {
    return 0;
  }

  const uint32_t length = atomic_load_explicit(
      &http_mailbox.length, memory_order_relaxed);
  chunk->status = atomic_load_explicit(&http_mailbox.status,
                                       memory_order_relaxed);
  chunk->kind = atomic_load_explicit(&http_mailbox.kind,
                                     memory_order_relaxed);
  chunk->error = atomic_load_explicit(&http_mailbox.error,
                                      memory_order_relaxed);
  chunk->eof = atomic_load_explicit(&http_mailbox.eof,
                                    memory_order_relaxed);
  chunk->length = length;

  int result = 1;
  if (length > DOLLY_HTTP_CHUNK_CAPACITY || length > capacity) {
    result = -EOVERFLOW;
  } else if (length != 0) {
    memcpy(data, http_mailbox.data, length);
  }
  atomic_store_explicit(&http_mailbox.state, chunk->eof ? 0 : 1,
                        memory_order_release);
  emscripten_atomic_notify((void *)&http_mailbox.state,
                           EMSCRIPTEN_NOTIFY_ALL_WAITERS);
  return result;
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
    int polled;
    while ((polled = dolly_http_poll(sequence, &chunk, data,
                                     DOLLY_HTTP_CHUNK_CAPACITY)) == 0) {
      const uint32_t state = atomic_load_explicit(
          &http_mailbox.state, memory_order_acquire);
      if (state != 2) {
        emscripten_atomic_wait_u32((void *)&http_mailbox.state, state,
                                   ATOMICS_WAIT_DURATION_INFINITE);
      }
    }
    if (polled < 0 && result == 0) result = polled;
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

int dolly_http_cancel(unsigned int active_sequence) {
  if (atomic_load_explicit(&http_mailbox.state, memory_order_acquire) == 0) {
    return 0;
  }
  if (active_sequence == 0 || atomic_load_explicit(
          &http_mailbox.sequence, memory_order_acquire) != active_sequence) {
    return -ESTALE;
  }
  const uint32_t sequence = atomic_fetch_add_explicit(
      &http_mailbox.sequence, 1, memory_order_acq_rel) + 1;
  atomic_store_explicit(&http_mailbox.status, 0, memory_order_relaxed);
  atomic_store_explicit(&http_mailbox.length, 0, memory_order_relaxed);
  atomic_store_explicit(&http_mailbox.eof, 1, memory_order_relaxed);
  atomic_store_explicit(&http_mailbox.error, 0, memory_order_relaxed);
  atomic_store_explicit(&http_mailbox.kind, 0, memory_order_relaxed);
  atomic_store_explicit(&http_mailbox.state, 0, memory_order_release);
  emscripten_atomic_notify((void *)&http_mailbox.state,
                           EMSCRIPTEN_NOTIFY_ALL_WAITERS);
  dolly_http_dispatch(NULL, NULL, NULL, NULL, 0, 0, sequence);
  return 0;
}

static int dolly_terminal_fill_raw_timeout(double milliseconds) {
  for (;;) {
    dolly_session_service();
    // A graphics owner consumes semantic records through
    // dolly_display_next_event. No terminal reader may race it for the shared
    // single-consumer event ring.
    if (display_lease.generation != 0) return -1;
    if (encoded_input_cursor < encoded_input_length) {
      return 1;
    }
    encoded_input_cursor = 0;
    encoded_input_length = 0;

    if (display_driver != NULL &&
        display_driver->handle_event(NULL, encoded_input,
                                     sizeof(encoded_input),
                                     &encoded_input_length) == 0 &&
        encoded_input_length != 0) continue;

    uint32_t read = atomic_load_explicit(&display_mailbox.event_read,
                                         memory_order_relaxed);
    uint32_t write = atomic_load_explicit(&display_mailbox.event_write,
                                          memory_order_acquire);
    if (read != write) {
      dolly_input_event event =
          display_mailbox.events[read & (DOLLY_DISPLAY_EVENT_CAPACITY - 1)];
      atomic_store_explicit(&display_mailbox.event_read, read + 1,
                            memory_order_release);
      if (display_driver != NULL &&
          display_driver->handle_event(&event, encoded_input,
                                       sizeof(encoded_input),
                                       &encoded_input_length) == 0 &&
          encoded_input_length != 0) continue;
      encoded_input_length = 0;
      continue;
    }

    uint32_t wake = atomic_load_explicit(&display_mailbox.event_wake,
                                         memory_order_acquire);
    // A session request shares this wake word but is not an input-ring event.
    // Check it after snapshotting the word, then refuse to sleep if the
    // browser changed the word in the check-to-wait window.
    dolly_session_service();
    if (atomic_load_explicit(&display_mailbox.event_write,
                             memory_order_acquire) == read &&
        atomic_load_explicit(&display_mailbox.event_wake,
                             memory_order_acquire) == wake) {
      if (milliseconds == 0) return -1;
      emscripten_atomic_wait_u32((void *)&display_mailbox.event_wake, wake,
                                 milliseconds < 0
                                     ? ATOMICS_WAIT_DURATION_INFINITE
                                     : milliseconds);
      dolly_session_service();
      if (milliseconds >= 0 &&
          atomic_load_explicit(&display_mailbox.event_write,
                               memory_order_acquire) == read) {
        return -1;
      }
    }
  }
}

int dolly_terminal_raw_ready_timeout(double milliseconds) {
  return dolly_terminal_fill_raw_timeout(milliseconds) > 0;
}

int dolly_terminal_read_raw_timeout(double milliseconds) {
  if (dolly_terminal_fill_raw_timeout(milliseconds) <= 0) return -1;
  return encoded_input[encoded_input_cursor++];
}

int dolly_terminal_read_raw(void) {
  return dolly_terminal_read_raw_timeout(-1);
}

static int update_suspended_terminal_layout(const dolly_input_event *event);

static int consume_initial_display_resize(void) {
  const uint32_t read = atomic_load_explicit(&display_mailbox.event_read,
                                              memory_order_relaxed);
  const uint32_t write = atomic_load_explicit(&display_mailbox.event_write,
                                               memory_order_acquire);
  if (read == write) return -EIO;
  const dolly_input_event event =
      display_mailbox.events[read & (DOLLY_DISPLAY_EVENT_CAPACITY - 1)];
  const size_t data_length =
      (size_t)event.key_length + event.code_length + event.text_length;
  if (event.type != DOLLY_INPUT_EVENT_RESIZE ||
      data_length > sizeof(event.data)) {
    return -EPROTO;
  }
  atomic_store_explicit(&display_mailbox.event_read, read + 1,
                        memory_order_release);
  return update_suspended_terminal_layout(&event);
}

static int process_may_acquire_display(int pid) {
  const uint32_t foreground = atomic_load_explicit(
      &display_mailbox.foreground_pid, memory_order_acquire);
  const uint32_t flags = atomic_load_explicit(
      &display_mailbox.flags, memory_order_relaxed);
  return pid > 0 && foreground > 0 &&
      (flags & DOLLY_DISPLAY_FOREGROUND_INTERRUPTIBLE) != 0 &&
      dolly_process_descends_from(pid, (int)foreground);
}

int dolly_kernel_display_acquire(int owner_pid,
                                 dolly_display_surface *surface) {
  if (surface == NULL) return -EINVAL;
  memset(surface, 0, sizeof(*surface));
  if (display_driver == NULL || display_frames[0] == NULL ||
      display_frames[1] == NULL) {
    return -ENODEV;
  }
  if (!process_may_acquire_display(owner_pid)) return -EPERM;
  if (display_lease.generation != 0) return -EBUSY;

  uint32_t width = atomic_load_explicit(&display_mailbox.frame_width,
                                         memory_order_acquire);
  uint32_t height = atomic_load_explicit(&display_mailbox.frame_height,
                                          memory_order_relaxed);
  uint32_t stride = atomic_load_explicit(&display_mailbox.frame_stride,
                                          memory_order_relaxed);
  if (width == 0 || height == 0 || stride != width * 4u) {
    const int status = consume_initial_display_resize();
    if (status != 0) return status;
    width = atomic_load_explicit(&display_mailbox.frame_width,
                                 memory_order_acquire);
    height = atomic_load_explicit(&display_mailbox.frame_height,
                                  memory_order_relaxed);
    stride = atomic_load_explicit(&display_mailbox.frame_stride,
                                  memory_order_relaxed);
  }
  if (width == 0 || height == 0 || stride != width * 4u ||
      (uint64_t)stride * height > display_frame_capacity) {
    return -EIO;
  }

  uint64_t generation = next_display_generation++;
  if (generation == 0) generation = next_display_generation++;
  display_driver->set_suspended(1);
  display_lease.generation = generation;
  display_lease.owner_pid = owner_pid;
  display_lease.width = width;
  display_lease.height = height;
  display_lease.stride = stride;
  encoded_input_cursor = 0;
  encoded_input_length = 0;
  dolly_terminal_reset_cooked();
  atomic_store_explicit(&display_mailbox.copy_length, 0, memory_order_relaxed);
  atomic_store_explicit(&display_mailbox.copy_flags, 0, memory_order_relaxed);
  atomic_fetch_add_explicit(&display_mailbox.copy_sequence, 1,
                            memory_order_release);
  atomic_store_explicit(&display_mailbox.cursor_col, UINT32_MAX,
                        memory_order_relaxed);
  atomic_store_explicit(&display_mailbox.cursor_row, UINT32_MAX,
                        memory_order_relaxed);
  atomic_store_explicit(&display_mailbox.cursor_style,
                        DOLLY_DISPLAY_CURSOR_DEFAULT, memory_order_release);
  atomic_fetch_or_explicit(&display_mailbox.flags,
                           DOLLY_DISPLAY_GRAPHICS_ACTIVE,
                           memory_order_release);

  surface->generation = generation;
  surface->width = width;
  surface->height = height;
  surface->stride = stride;
  surface->pixel_format = DOLLY_DISPLAY_PIXEL_RGBA8;
  return 0;
}

int dolly_kernel_display_set_size(int owner_pid, uint64_t generation,
                                  uint32_t width, uint32_t height,
                                  dolly_display_surface *surface) {
  if (surface == NULL || width == 0 || height == 0 ||
      width > DOLLY_DISPLAY_MAX_WIDTH || height > DOLLY_DISPLAY_MAX_HEIGHT ||
      (uint64_t)width * height * 4u > display_frame_capacity) {
    return -EINVAL;
  }
  int status = validate_display_lease(owner_pid, generation);
  if (status != 0) return status;
  display_lease.width = width;
  display_lease.height = height;
  display_lease.stride = width * 4u;
  surface->generation = generation;
  surface->width = width;
  surface->height = height;
  surface->stride = display_lease.stride;
  surface->pixel_format = DOLLY_DISPLAY_PIXEL_RGBA8;
  return 0;
}

int dolly_kernel_display_begin_frame(int owner_pid, uint64_t generation,
                                     dolly_display_frame *frame) {
  if (frame == NULL) return -EINVAL;
  memset(frame, 0, sizeof(*frame));
  int status = validate_display_lease(owner_pid, generation);
  if (status != 0) return status;

  const uint32_t width = display_lease.width;
  const uint32_t height = display_lease.height;
  const uint32_t stride = display_lease.stride;
  const uint64_t length = (uint64_t)stride * height;
  if (width == 0 || height == 0 || stride != width * 4u ||
      length > display_frame_capacity) {
    return -EIO;
  }
  const uint32_t active = atomic_load_explicit(&display_mailbox.frame_index,
                                                memory_order_acquire) & 1u;
  const uint32_t next = active ^ 1u;
  frame->pixels = display_frames[next];
  frame->capacity = (size_t)length;
  frame->buffer_index = next;
  frame->width = width;
  frame->height = height;
  frame->stride = stride;
  frame->pixel_format = DOLLY_DISPLAY_PIXEL_RGBA8;
  display_lease.staging_buffer = next;
  display_lease.staging_offset = 0;
  display_lease.staging = 1;
  return 0;
}

int dolly_kernel_display_write_frame(int owner_pid, uint64_t generation,
                                     uint32_t buffer_index, size_t offset,
                                     const unsigned char *bytes, size_t size) {
  int status = validate_display_lease(owner_pid, generation);
  if (status != 0) return status;
  const size_t capacity = (size_t)display_lease.stride * display_lease.height;
  if (!display_lease.staging || bytes == NULL ||
      buffer_index != display_lease.staging_buffer ||
      offset != display_lease.staging_offset || offset > capacity ||
      size > capacity - offset) {
    return -EINVAL;
  }
  memcpy(display_frames[buffer_index] + offset, bytes, size);
  display_lease.staging_offset += size;
  return 0;
}

int dolly_kernel_display_present(int owner_pid, uint64_t generation,
                                 uint32_t buffer_index) {
  int status = validate_display_lease(owner_pid, generation);
  if (status != 0) return status;
  const uint32_t active = atomic_load_explicit(&display_mailbox.frame_index,
                                                memory_order_acquire) & 1u;
  if (buffer_index >= DOLLY_DISPLAY_FRAME_COUNT ||
      buffer_index != (active ^ 1u) || !display_lease.staging ||
      buffer_index != display_lease.staging_buffer) {
    return -EINVAL;
  }
  const uint32_t width = display_lease.width;
  const uint32_t height = display_lease.height;
  const uint32_t stride = display_lease.stride;
  if (width == 0 || height == 0 || stride != width * 4u ||
      (uint64_t)stride * height > display_frame_capacity) {
    return -EIO;
  }
  if (display_lease.staging_offset != (size_t)stride * height) return -ENODATA;
  atomic_store_explicit(&display_mailbox.frame_width, width,
                        memory_order_relaxed);
  atomic_store_explicit(&display_mailbox.frame_height, height,
                        memory_order_relaxed);
  atomic_store_explicit(&display_mailbox.frame_stride, stride,
                        memory_order_relaxed);
  atomic_store_explicit(&display_mailbox.frame_index, buffer_index,
                        memory_order_release);
  atomic_fetch_add_explicit(&display_mailbox.frame_sequence, 1,
                            memory_order_acq_rel);
  display_lease.staging = 0;
  display_lease.staging_offset = 0;
  return 0;
}

int dolly_kernel_display_poll_frame(int owner_pid, uint64_t generation,
                                    uint32_t sequence, uint32_t *current) {
  if (current == NULL) return -EINVAL;
  const int status = validate_display_lease(owner_pid, generation);
  if (status != 0) return status;
  *current = atomic_load_explicit(
      &display_mailbox.animation_frame_sequence, memory_order_acquire);
  return *current == sequence ? 0 : 1;
}

int dolly_kernel_display_set_cursor(int owner_pid, uint64_t generation,
                                    uint32_t cursor) {
  int status = validate_display_lease(owner_pid, generation);
  if (status != 0) return status;
  if (cursor > DOLLY_DISPLAY_CURSOR_HIDDEN) return -EINVAL;
  atomic_store_explicit(&display_mailbox.cursor_style, cursor,
                        memory_order_release);
  return 0;
}

static int update_suspended_terminal_layout(const dolly_input_event *event) {
  if (display_driver == NULL || event->type != DOLLY_INPUT_EVENT_RESIZE) {
    return 0;
  }
  unsigned char ignored[256];
  size_t ignored_length = 0;
  do {
    if (display_driver->handle_event(NULL, ignored, sizeof(ignored),
                                     &ignored_length) != 0) {
      return -EIO;
    }
  } while (ignored_length != 0);
  if (display_driver->handle_event(event, ignored, sizeof(ignored),
                                   &ignored_length) != 0) {
    return -EIO;
  }
  return 0;
}

int dolly_kernel_display_poll_event(int owner_pid, uint64_t generation,
                                    dolly_input_event *event) {
  if (event == NULL) return -EINVAL;
  int status = validate_display_lease(owner_pid, generation);
  if (status != 0) return status;
  const uint32_t read = atomic_load_explicit(&display_mailbox.event_read,
                                              memory_order_relaxed);
  const uint32_t write = atomic_load_explicit(&display_mailbox.event_write,
                                               memory_order_acquire);
  if (read == write) return 0;
  const dolly_input_event candidate =
      display_mailbox.events[read & (DOLLY_DISPLAY_EVENT_CAPACITY - 1)];
  atomic_store_explicit(&display_mailbox.event_read, read + 1,
                        memory_order_release);
  const size_t data_length = (size_t)candidate.key_length +
                             candidate.code_length + candidate.text_length;
  if (data_length > sizeof(candidate.data)) return -EPROTO;
  status = update_suspended_terminal_layout(&candidate);
  if (status != 0) return status;
  *event = candidate;
  return 1;
}

int dolly_kernel_display_release(int owner_pid, uint64_t generation) {
  int status = validate_display_lease(owner_pid, generation);
  if (status != 0) return status;
  release_display_lease_for_pid(owner_pid);
  return 0;
}

void dolly_kernel_display_release_owner(int owner_pid) {
  release_display_lease_for_pid(owner_pid);
}

uint32_t dolly_terminal_columns(void) {
  return atomic_load_explicit(&display_mailbox.terminal_cols,
                              memory_order_acquire);
}

uint32_t dolly_terminal_rows(void) {
  return atomic_load_explicit(&display_mailbox.terminal_rows,
                              memory_order_acquire);
}

void dolly_terminal_reset_cooked(void) {
  cooked_length = 0;
  cooked_cursor = 0;
  cooked_boundary = 0;
  clearerr(stdin);
}

static void dolly_terminal_discard_pending_input(void) {
  // An application may return immediately on a key-down event while the
  // matching key-up record is already queued. That record belongs to the old
  // foreground command and must not become input to its successor. Preserve
  // resize records so Ghostty still adopts the latest browser geometry.
  uint32_t read = atomic_load_explicit(&display_mailbox.event_read,
                                       memory_order_relaxed);
  const uint32_t write = atomic_load_explicit(&display_mailbox.event_write,
                                               memory_order_acquire);
  while (read != write) {
    const dolly_input_event event =
        display_mailbox.events[read & (DOLLY_DISPLAY_EVENT_CAPACITY - 1)];
    ++read;
    atomic_store_explicit(&display_mailbox.event_read, read,
                          memory_order_release);
    if (event.type == DOLLY_INPUT_EVENT_RESIZE) {
      (void)update_suspended_terminal_layout(&event);
    }
  }
  const uint32_t paste_sequence = atomic_load_explicit(
      &display_mailbox.paste_sequence, memory_order_acquire);
  atomic_store_explicit(&display_mailbox.paste_consumed_sequence,
                        paste_sequence, memory_order_release);
  encoded_input_cursor = 0;
  encoded_input_length = 0;
  dolly_terminal_reset_cooked();
}

void dolly_terminal_publish_result(int status) {
  atomic_store_explicit(&display_mailbox.result_status, (uint32_t)status,
                        memory_order_release);
  atomic_fetch_add_explicit(&display_mailbox.result_sequence, 1,
                            memory_order_acq_rel);
  emscripten_atomic_notify((void *)&display_mailbox.result_sequence,
                           EMSCRIPTEN_NOTIFY_ALL_WAITERS);
}

/*
 * Private Wasm processes execute in Workers, but the terminal ownership word
 * remains kernel state in the shared userspace memory. The supervisor changes
 * only this explicit process-shaped state; the browser merely publishes an
 * interrupt request for the displayed foreground owner.
 */
EMSCRIPTEN_KEEPALIVE
int dolly_process_foreground_set(int pid, int interruptible) {
  if (pid <= 0 || (interruptible != 0 && interruptible != 1)) return -EINVAL;
  atomic_store_explicit(&display_mailbox.foreground_pid, (uint32_t)pid,
                        memory_order_release);
  if (interruptible) {
    atomic_fetch_or_explicit(
        &display_mailbox.flags, DOLLY_DISPLAY_FOREGROUND_INTERRUPTIBLE,
        memory_order_release);
  } else {
    atomic_fetch_and_explicit(
        &display_mailbox.flags,
        ~((uint32_t)DOLLY_DISPLAY_FOREGROUND_INTERRUPTIBLE),
        memory_order_release);
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int dolly_process_foreground_clear(int pid) {
  if (pid <= 0 || atomic_load_explicit(
          &display_mailbox.foreground_pid, memory_order_acquire) !=
          (uint32_t)pid) return -ESRCH;
  release_display_lease_for_pid(pid);
  atomic_store_explicit(&display_mailbox.foreground_pid, 0,
                        memory_order_release);
  atomic_fetch_and_explicit(
      &display_mailbox.flags,
      ~((uint32_t)DOLLY_DISPLAY_FOREGROUND_INTERRUPTIBLE),
      memory_order_release);
  dolly_terminal_discard_pending_input();
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int dolly_process_take_interrupt(void) {
  const uint32_t sequence = atomic_load_explicit(
      &display_mailbox.interrupt_sequence, memory_order_acquire);
  if (sequence == consumed_interrupt_sequence) return 0;
  consumed_interrupt_sequence = sequence;
  const uint32_t target = atomic_load_explicit(
      &display_mailbox.interrupt_target_pid, memory_order_relaxed);
  const uint32_t foreground = atomic_load_explicit(
      &display_mailbox.foreground_pid, memory_order_acquire);
  const uint32_t flags = atomic_load_explicit(
      &display_mailbox.flags, memory_order_relaxed);
  return target != 0 && target == foreground &&
      (flags & DOLLY_DISPLAY_FOREGROUND_INTERRUPTIBLE) != 0
      ? (int)target : 0;
}

int dolly_isatty(int descriptor) {
  if (descriptor >= STDIN_FILENO && descriptor <= STDERR_FILENO) {
    if ((active_terminal_mask & (1u << descriptor)) != 0) return 1;
    errno = ENOTTY;
    return 0;
  }
  struct stat metadata;
  if (fstat(descriptor, &metadata) != 0) return 0;
  if (S_ISCHR(metadata.st_mode)) return 1;
  errno = ENOTTY;
  return 0;
}

int dolly_terminal_mode_get(int descriptor) {
  if (!dolly_isatty(descriptor)) return -errno;
  return (int)terminal_mode_flags;
}

int dolly_terminal_mode_set(int descriptor, uint32_t flags) {
  const uint32_t valid = DOLLY_TERMINAL_CANONICAL | DOLLY_TERMINAL_ECHO;
  if ((flags & ~valid) != 0) return -EINVAL;
  if (!dolly_isatty(descriptor)) return -errno;
  terminal_mode_flags = flags;
  dolly_terminal_reset_cooked();
  return 0;
}

void dolly_terminal_write(const char *text) {
  if (text != NULL) {
    dolly_terminal_write_bytes((const unsigned char *)text, strlen(text));
  }
}

EMSCRIPTEN_KEEPALIVE
void dolly_terminal_write_bytes(const unsigned char *bytes, uintptr_t length) {
  if (bytes == NULL || length == 0) return;
  if (display_driver != NULL) {
    display_driver->write(bytes, (size_t)length);
  } else {
    dolly_bootstrap_write_bytes(bytes, length);
  }
}

/*
 * Terminal parsing and rasterization deliberately have different costs.  A
 * write updates Ghostty's in-Wasm terminal state immediately, while this
 * bounded service hook publishes at most one dirty framebuffer per supervisor
 * tick.  Passing zero output capacity is important: handle_event(NULL, ...)
 * may expose a terminal-query response, and a presentation tick must neither
 * consume nor discard those input bytes.
 */
EMSCRIPTEN_KEEPALIVE
int dolly_terminal_present_pending(void) {
  if (display_driver == NULL || display_lease.generation != 0) return 0;
  unsigned char preserved;
  size_t output_length = 0;
  return display_driver->handle_event(
      NULL, &preserved, 0, &output_length);
}

static void echo_byte(unsigned char byte) {
  dolly_terminal_write_bytes(&byte, 1);
}

// This is Dolly's WasmFS stdin device. It implements a small canonical line
// discipline above the in-Wasm mailbox and never delegates to Emscripten JS.
int _wasmfs_stdin_get_char(void) {
  if ((terminal_mode_flags & DOLLY_TERMINAL_CANONICAL) == 0) {
    const int byte = dolly_terminal_read_raw();
    if (byte < 0) return -1;
    if ((terminal_mode_flags & DOLLY_TERMINAL_ECHO) != 0) {
      echo_byte((unsigned char)byte);
    }
    return byte;
  }
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

_Noreturn void dolly_assert_fail(const char *condition, const char *file,
                                 unsigned line, const char *function) {
  fprintf(stderr, "%s:%u: %s: assertion failed: %s\n",
          file, line, function, condition);
  abort();
}

int dolly_fclose(FILE *stream) {
  return fclose(stream);
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

int dolly_download_file(const char *path) {
  enum { DOLLY_DOWNLOAD_MAX_BYTES = 64 * 1024 * 1024 };
  if (path == NULL || path[0] == '\0') return -EINVAL;
  struct stat metadata;
  if (stat(path, &metadata) != 0) return -errno;
  if (!S_ISREG(metadata.st_mode)) return -EINVAL;
  if (metadata.st_size < 0 || metadata.st_size > DOLLY_DOWNLOAD_MAX_BYTES) {
    return -EFBIG;
  }
  const char *name = strrchr(path, '/');
  name = name == NULL ? path : name + 1;
  const size_t name_length = strlen(name);
  if (name_length == 0 || name_length > 255 || strcmp(name, ".") == 0 ||
      strcmp(name, "..") == 0) return -EINVAL;

  const size_t length = (size_t)metadata.st_size;
  unsigned char *contents = malloc(length == 0 ? 1 : length);
  if (contents == NULL) return -ENOMEM;
  int descriptor = open(path, O_RDONLY);
  if (descriptor < 0) {
    const int status = -errno;
    free(contents);
    return status;
  }
  size_t offset = 0;
  int status = 0;
  while (offset < length) {
    const ssize_t count = read(descriptor, contents + offset, length - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) {
      status = count == 0 ? -EIO : -errno;
      break;
    }
    offset += (size_t)count;
  }
  if (close(descriptor) != 0 && status == 0) status = -errno;
  if (status == 0) {
    status = dolly_download_dispatch((const unsigned char *)name, name_length,
                                     contents, length);
  }
  free(contents);
  return status;
}

static int install_display_driver(void) {
  static const char font_path[] =
      "/usr/share/fonts/IosevkaTerm-SemiBold.ttf";

  const char *driver_path = getenv("DISPLAY");
  if (driver_path == NULL || driver_path[0] != '/') {
    fputs("dolly: DISPLAY must name an absolute shared-library path\n", stderr);
    return 1;
  }

  printf("dolly: loading sandbox display library %s\n", driver_path);
  fflush(stdout);
  // The process compiler admits this trusted resident plugin only after exact
  // validation against dolly-kernel-plugin-0. Its bytes are then sealed by the
  // content-addressed module layer and system snapshot. dlopen performs the
  // final typed relocation check before the v3 driver table is accepted.
  for (size_t index = 0; index < DOLLY_DISPLAY_FRAME_COUNT; ++index) {
    display_frames[index] = malloc(display_frame_capacity);
    if (display_frames[index] == NULL) {
      fputs("dolly: could not allocate sandbox framebuffer\n", stderr);
      return 1;
    }
  }

  display_module = dlopen(driver_path, RTLD_NOW | RTLD_LOCAL);
  if (display_module == NULL) {
    fprintf(stderr, "dolly: dlopen %s failed: %s\n", driver_path, dlerror());
    return 1;
  }
  dlerror();
  dolly_display_driver_getter_v3 getter =
      (dolly_display_driver_getter_v3)dlsym(
          display_module, "dolly_display_driver_get_v3");
  const char *error = dlerror();
  if (error != NULL || getter == NULL) {
    fprintf(stderr, "dolly: display driver export failed: %s\n",
            error != NULL ? error : "missing getter");
    return 1;
  }
  const dolly_display_driver_v3 *candidate = getter();
  if (candidate == NULL || candidate->abi_version != 3 ||
      candidate->struct_size < sizeof(*candidate) ||
      candidate->initialize == NULL || candidate->write == NULL ||
      candidate->handle_event == NULL || candidate->set_suspended == NULL) {
    fputs("dolly: incompatible sandbox display driver\n", stderr);
    return 1;
  }
  if (candidate->initialize(&display_mailbox, display_frames[0],
                            display_frames[1], display_frame_capacity,
                            display_paste_buffer, display_copy_buffer,
                            DOLLY_DISPLAY_CLIPBOARD_CAPACITY,
                            font_path) != 0) {
    fputs("dolly: sandbox display initialization failed\n", stderr);
    return 1;
  }
  atomic_store_explicit(&display_mailbox.cursor_style,
                        DOLLY_DISPLAY_CURSOR_TEXT, memory_order_release);
  puts("dolly: sandbox display ready");
  fflush(stdout);
  display_driver = candidate;
  return 0;
}

static int copy_seed_file(const char *source, const char *destination) {
  int input = open(source, O_RDONLY);
  if (input < 0) return -1;
  int output = open(destination, O_WRONLY | O_CREAT | O_TRUNC, 0666);
  if (output < 0) {
    close(input);
    return -1;
  }
  unsigned char bytes[64 * 1024];
  int status = 0;
  for (;;) {
    const ssize_t count = read(input, bytes, sizeof(bytes));
    if (count < 0) {
      status = -1;
      break;
    }
    if (count == 0) break;
    size_t offset = 0;
    while (offset < (size_t)count) {
      const ssize_t written = write(output, bytes + offset,
                                    (size_t)count - offset);
      if (written <= 0) {
        status = -1;
        break;
      }
      offset += (size_t)written;
    }
    if (status != 0) break;
  }
  int saved_error = status == 0 ? 0 : errno;
  if (close(output) != 0 && status == 0) {
    status = -1;
    saved_error = errno;
  }
  if (close(input) != 0 && status == 0) {
    status = -1;
    saved_error = errno;
  }
  if (status != 0) errno = saved_error == 0 ? EIO : saved_error;
  return status;
}

static int install_seed_tree(const char *source, const char *destination) {
  struct stat metadata;
  if (stat(source, &metadata) != 0) return -1;
  if (S_ISREG(metadata.st_mode)) return copy_seed_file(source, destination);
  if (!S_ISDIR(metadata.st_mode)) {
    errno = ENOTSUP;
    return -1;
  }

  struct stat destination_metadata;
  if (stat(destination, &destination_metadata) != 0) {
    if (mkdir(destination, 0755) != 0) return -1;
  } else if (!S_ISDIR(destination_metadata.st_mode)) {
    errno = ENOTDIR;
    return -1;
  }

  DIR *directory = opendir(source);
  if (directory == NULL) return -1;
  int status = 0;
  for (;;) {
    errno = 0;
    struct dirent *entry = readdir(directory);
    if (entry == NULL) {
      if (errno != 0) status = -1;
      break;
    }
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
      continue;
    }
    char child_source[PATH_MAX];
    char child_destination[PATH_MAX];
    if (snprintf(child_source, sizeof(child_source), "%s/%s", source,
                 entry->d_name) >= (int)sizeof(child_source) ||
        snprintf(child_destination, sizeof(child_destination), "%s/%s",
                 destination, entry->d_name) >= (int)sizeof(child_destination)) {
      errno = ENAMETOOLONG;
      status = -1;
      break;
    }
    if (install_seed_tree(child_source, child_destination) != 0) {
      status = -1;
      break;
    }
  }
  int saved_error = status == 0 ? 0 : errno;
  if (closedir(directory) != 0 && status == 0) {
    status = -1;
    saved_error = errno;
  }
  if (status != 0) errno = saved_error == 0 ? EIO : saved_error;
  return status;
}

static int initialize_boot_environment(void) {
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

  if (install_seed_tree("/seed/usr", "/usr") != 0) {
    fprintf(stderr, "dolly: could not install compiler seed: %s\n",
            strerror(errno));
    return 1;
  }

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
  if (setenv("SHELL", "/bin/slop", 1) != 0) {
    fprintf(stderr, "dolly: SHELL initialization failed: %s\n", strerror(errno));
    return 1;
  }
  if (setenv("TERM", "xterm-256color", 1) != 0 ||
      setenv("COLORTERM", "truecolor", 1) != 0) {
    fprintf(stderr, "dolly: terminal environment initialization failed: %s\n",
            strerror(errno));
    return 1;
  }
  return 0;
}

static int load_image_environment(void);

EMSCRIPTEN_KEEPALIVE
int dolly_process_bootstrap_prepare(void) {
  return initialize_boot_environment();
}

EMSCRIPTEN_KEEPALIVE
int dolly_process_bootstrap_resume_prepare(uintptr_t size,
                                           uint32_t resume_uses) {
  if (resume_uses == 0 || initialize_boot_environment() != 0) return 1;
  printf("dolly: restoring %u cached module%s\n", resume_uses,
         resume_uses == 1 ? "" : "s");
  fflush(stdout);
  if (dolly_snapshot_restore_staged(size) != 0) {
    fprintf(stderr, "dolly: invalid module cache snapshot: %s\n",
            strerror(errno));
    return 1;
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int dolly_bootstrap_snapshot(uintptr_t size) {
  if (initialize_boot_environment() != 0) return 1;
  puts("dolly: restoring precompiled system snapshot");
  fflush(stdout);
  if (dolly_snapshot_restore_staged(size) != 0) {
    fprintf(stderr, "dolly: invalid system snapshot: %s\n", strerror(errno));
    return 1;
  }
  if (load_image_environment() != 0) {
    fprintf(stderr, "dolly: invalid image environment: %s\n", strerror(errno));
    return 1;
  }
  puts("dolly: precompiled system restored");
  fflush(stdout);
  return install_display_driver();
}

EMSCRIPTEN_KEEPALIVE
int dolly_bootstrap_finish(void) {
  if (load_image_environment() != 0) {
    fprintf(stderr, "dolly: invalid built image environment: %s\n",
            strerror(errno));
    return 1;
  }
  return install_display_driver();
}

static uint32_t take_entry_u32(const unsigned char **cursor,
                               const unsigned char *end, int *valid) {
  if (!*valid || (size_t)(end - *cursor) < 4) {
    *valid = 0;
    return 0;
  }
  const uint32_t value = (uint32_t)(*cursor)[0] |
                         ((uint32_t)(*cursor)[1] << 8) |
                         ((uint32_t)(*cursor)[2] << 16) |
                         ((uint32_t)(*cursor)[3] << 24);
  *cursor += 4;
  return value;
}

static int valid_environment_name_bytes(const unsigned char *name,
                                        uint32_t length) {
  if (length == 0 || length > 128 ||
      !((name[0] >= 'A' && name[0] <= 'Z') ||
        (name[0] >= 'a' && name[0] <= 'z') || name[0] == '_')) return 0;
  for (uint32_t index = 1; index < length; ++index) {
    if (!((name[index] >= 'A' && name[index] <= 'Z') ||
          (name[index] >= 'a' && name[index] <= 'z') ||
          (name[index] >= '0' && name[index] <= '9') || name[index] == '_')) {
      return 0;
    }
  }
  return 1;
}

static int load_image_environment(void) {
  int descriptor = open("/etc/dolly/environment", O_RDONLY);
  if (descriptor < 0) return -1;
  struct stat metadata;
  if (fstat(descriptor, &metadata) != 0 || metadata.st_size < 16 ||
      metadata.st_size > 128 * 1024) {
    const int saved = errno == 0 ? EINVAL : errno;
    close(descriptor);
    errno = saved;
    return -1;
  }
  unsigned char *bytes = malloc((size_t)metadata.st_size);
  if (bytes == NULL) {
    close(descriptor);
    return -1;
  }
  size_t offset = 0;
  while (offset < (size_t)metadata.st_size) {
    const ssize_t count = read(descriptor, bytes + offset,
                               (size_t)metadata.st_size - offset);
    if (count <= 0) {
      const int saved = count == 0 ? EINVAL : errno;
      free(bytes);
      close(descriptor);
      errno = saved;
      return -1;
    }
    offset += (size_t)count;
  }
  if (close(descriptor) != 0 || memcmp(bytes, "DOLLYENV", 8) != 0) {
    free(bytes);
    errno = EINVAL;
    return -1;
  }
  const unsigned char *cursor = bytes + 8;
  const unsigned char *end = bytes + metadata.st_size;
  int valid = 1;
  int error = EINVAL;
  const uint32_t version = take_entry_u32(&cursor, end, &valid);
  const uint32_t count = take_entry_u32(&cursor, end, &valid);
  if (!valid || version != 1 || count > 256) valid = 0;
  for (uint32_t index = 0; valid && index < count; ++index) {
    const uint32_t name_length = take_entry_u32(&cursor, end, &valid);
    const uint32_t value_length = take_entry_u32(&cursor, end, &valid);
    if (!valid || name_length == 0 || name_length > 128 ||
        value_length > 64 * 1024 ||
        (size_t)(end - cursor) < (size_t)name_length + value_length ||
        memchr(cursor, '\0', name_length) != NULL ||
        !valid_environment_name_bytes(cursor, name_length) ||
        memchr(cursor + name_length, '\0', value_length) != NULL) {
      valid = 0;
      break;
    }
    char *name = malloc((size_t)name_length + 1);
    char *value = malloc((size_t)value_length + 1);
    if (name == NULL || value == NULL) {
      free(name);
      free(value);
      valid = 0;
      error = ENOMEM;
      break;
    }
    memcpy(name, cursor, name_length);
    name[name_length] = '\0';
    cursor += name_length;
    memcpy(value, cursor, value_length);
    value[value_length] = '\0';
    cursor += value_length;
    if (setenv(name, value, 1) != 0) {
      valid = 0;
      error = errno;
    }
    free(name);
    free(value);
  }
  free(bytes);
  if (!valid || cursor != end) {
    errno = error;
    return -1;
  }
  return 0;
}

int main(void) {
  return 0;
}
