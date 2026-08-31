#include <errno.h>
#include <dirent.h>
#include <dlfcn.h>
#include <fcntl.h>
#include <limits.h>
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

#include <dolly/display.h>
#include <dolly/http.h>

#include "dolly-runtime.h"
#include "system-snapshot.h"

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
static int active_process_pid;
static int interactive_shell_pid;
static int launching_interactive_shell;
static double active_process_deadline = -1;
static uint32_t consumed_interrupt_sequence;
// The boot streams are Dolly's terminal. Synchronous spawn derives a child
// view from its requested descriptors and restores the parent view afterward.
// WasmFS does not consistently expose terminal identity through native-style
// ioctl/fstat metadata for all three standard descriptors.
static uint32_t active_terminal_mask = 0x7u;

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

static uint32_t display_flags_for_pid(int pid) {
  uint32_t flags = 0;
  if (pid > 0 && pid != interactive_shell_pid) {
    flags |= DOLLY_DISPLAY_FOREGROUND_INTERRUPTIBLE;
  }
  if (display_lease.generation != 0) flags |= DOLLY_DISPLAY_GRAPHICS_ACTIVE;
  return flags;
}

static int validate_display_lease(uint64_t generation) {
  if (generation == 0 || display_lease.generation != generation) {
    return -ESTALE;
  }
  if (active_process_pid <= 0 ||
      active_process_pid != display_lease.owner_pid) {
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
  dolly_interrupt_checkpoint();
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
        dolly_interrupt_checkpoint();
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

int dolly_terminal_read_raw_timeout(double milliseconds) {
  for (;;) {
    dolly_interrupt_checkpoint();
    // A graphics owner consumes semantic records through
    // dolly_display_next_event. No terminal reader may race it for the shared
    // single-consumer event ring.
    if (display_lease.generation != 0) return -1;
    if (encoded_input_cursor < encoded_input_length) {
      return encoded_input[encoded_input_cursor++];
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
    if (atomic_load_explicit(&display_mailbox.event_write,
                             memory_order_acquire) == read) {
      if (milliseconds == 0) return -1;
      emscripten_atomic_wait_u32((void *)&display_mailbox.event_wake, wake,
                                 milliseconds < 0
                                     ? ATOMICS_WAIT_DURATION_INFINITE
                                     : milliseconds);
      if (milliseconds >= 0 &&
          atomic_load_explicit(&display_mailbox.event_write,
                               memory_order_acquire) == read) {
        return -1;
      }
    }
  }
}

int dolly_terminal_read_raw(void) {
  return dolly_terminal_read_raw_timeout(-1);
}

int dolly_display_acquire(dolly_display_surface *surface) {
  if (surface == NULL) return -EINVAL;
  memset(surface, 0, sizeof(*surface));
  if (display_driver == NULL || display_frames[0] == NULL ||
      display_frames[1] == NULL) {
    return -ENODEV;
  }
  if (active_process_pid <= 0 || active_process_pid == interactive_shell_pid ||
      atomic_load_explicit(&display_mailbox.foreground_pid,
                           memory_order_acquire) !=
          (uint32_t)active_process_pid) {
    return -EPERM;
  }
  if (display_lease.generation != 0) return -EBUSY;

  const uint32_t width = atomic_load_explicit(&display_mailbox.frame_width,
                                               memory_order_acquire);
  const uint32_t height = atomic_load_explicit(&display_mailbox.frame_height,
                                                memory_order_relaxed);
  const uint32_t stride = atomic_load_explicit(&display_mailbox.frame_stride,
                                                memory_order_relaxed);
  if (width == 0 || height == 0 || stride != width * 4u ||
      (uint64_t)stride * height > display_frame_capacity) {
    return -EIO;
  }

  uint64_t generation = next_display_generation++;
  if (generation == 0) generation = next_display_generation++;
  display_driver->set_suspended(1);
  display_lease.generation = generation;
  display_lease.owner_pid = active_process_pid;
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

int dolly_display_begin_frame(uint64_t generation, dolly_display_frame *frame) {
  if (frame == NULL) return -EINVAL;
  memset(frame, 0, sizeof(*frame));
  int status = validate_display_lease(generation);
  if (status != 0) return status;

  const uint32_t width = atomic_load_explicit(&display_mailbox.frame_width,
                                               memory_order_acquire);
  const uint32_t height = atomic_load_explicit(&display_mailbox.frame_height,
                                                memory_order_relaxed);
  const uint32_t stride = atomic_load_explicit(&display_mailbox.frame_stride,
                                                memory_order_relaxed);
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
  return 0;
}

int dolly_display_present(uint64_t generation, uint32_t buffer_index) {
  int status = validate_display_lease(generation);
  if (status != 0) return status;
  const uint32_t active = atomic_load_explicit(&display_mailbox.frame_index,
                                                memory_order_acquire) & 1u;
  if (buffer_index >= DOLLY_DISPLAY_FRAME_COUNT ||
      buffer_index != (active ^ 1u)) {
    return -EINVAL;
  }
  const uint32_t width = atomic_load_explicit(&display_mailbox.frame_width,
                                               memory_order_relaxed);
  const uint32_t height = atomic_load_explicit(&display_mailbox.frame_height,
                                                memory_order_relaxed);
  const uint32_t stride = atomic_load_explicit(&display_mailbox.frame_stride,
                                                memory_order_relaxed);
  if (width == 0 || height == 0 || stride != width * 4u ||
      (uint64_t)stride * height > display_frame_capacity) {
    return -EIO;
  }
  atomic_store_explicit(&display_mailbox.frame_index, buffer_index,
                        memory_order_release);
  atomic_fetch_add_explicit(&display_mailbox.frame_sequence, 1,
                            memory_order_acq_rel);
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

int dolly_display_next_event(uint64_t generation, dolly_input_event *event,
                             double timeout_milliseconds) {
  if (event == NULL || timeout_milliseconds != timeout_milliseconds) {
    return -EINVAL;
  }
  for (;;) {
    int status = validate_display_lease(generation);
    if (status != 0) return status;
    dolly_interrupt_checkpoint();

    const uint32_t read = atomic_load_explicit(&display_mailbox.event_read,
                                                memory_order_relaxed);
    const uint32_t write = atomic_load_explicit(&display_mailbox.event_write,
                                                 memory_order_acquire);
    if (read != write) {
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

    const uint32_t wake = atomic_load_explicit(&display_mailbox.event_wake,
                                                memory_order_acquire);
    if (atomic_load_explicit(&display_mailbox.event_write,
                             memory_order_acquire) != read) {
      continue;
    }
    if (timeout_milliseconds == 0) return 0;
    emscripten_atomic_wait_u32(
        (void *)&display_mailbox.event_wake, wake,
        timeout_milliseconds < 0 ? ATOMICS_WAIT_DURATION_INFINITE
                                 : timeout_milliseconds);
    dolly_interrupt_checkpoint();
    if (timeout_milliseconds >= 0 &&
        atomic_load_explicit(&display_mailbox.event_write,
                             memory_order_acquire) == read) {
      return 0;
    }
  }
}

int dolly_display_release(uint64_t generation) {
  int status = validate_display_lease(generation);
  if (status != 0) return status;
  release_display_lease_for_pid(active_process_pid);
  return 0;
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

void dolly_terminal_publish_result(int status) {
  atomic_store_explicit(&display_mailbox.result_status, (uint32_t)status,
                        memory_order_release);
  atomic_fetch_add_explicit(&display_mailbox.result_sequence, 1,
                            memory_order_acq_rel);
  emscripten_atomic_notify((void *)&display_mailbox.result_sequence,
                           EMSCRIPTEN_NOTIFY_ALL_WAITERS);
}

int dolly_interrupt_poll(void) {
  const uint32_t sequence = atomic_load_explicit(
      &display_mailbox.interrupt_sequence, memory_order_acquire);
  if (sequence == consumed_interrupt_sequence) return 0;

  const uint32_t target = atomic_load_explicit(
      &display_mailbox.interrupt_target_pid, memory_order_relaxed);
  consumed_interrupt_sequence = sequence;
  if (exit_depth == 0 || active_process_pid <= 0 ||
      target != (uint32_t)active_process_pid ||
      active_process_pid == interactive_shell_pid) {
    return 0;
  }
  return SIGINT;
}

void dolly_interrupt_checkpoint(void) {
  int status = 0;
  if (active_process_deadline >= 0 &&
      emscripten_get_now() >= active_process_deadline) {
    status = 124;
  } else if (dolly_interrupt_poll() == SIGINT) {
    status = 128 + SIGINT;
  } else {
    return;
  }
  // Cancellation must not enter arbitrary atexit teardown that may itself be
  // hung. Unwind only the current filesystem command boundary.
  dolly_exit_frame *frame = &exit_frames[exit_depth - 1];
  frame->callback_count = 0;
  frame->status = status;
  longjmp(frame->environment, 1);
}

// Dolly's C/C++ target inserts this callback on control-flow edges. It is an
// in-runtime cancellation safepoint and introduces no browser capability.
void __sanitizer_cov_trace_pc(void) {
  dolly_interrupt_checkpoint();
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
  if (!dolly_toolchain_validate_executable(path)) {
    fprintf(stderr, "dolly: refusing invalid executable module: %s\n",
            path == NULL ? "(null)" : path);
    return 126;
  }
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
  if (length > (size_t)SSIZE_MAX) {
    errno = EINVAL;
    return -1;
  }
  if (buffer == NULL && length != 0) {
    errno = EFAULT;
    return -1;
  }
  unsigned char *cursor = buffer;
  size_t remaining = length;
  while (remaining != 0) {
    const size_t chunk = remaining > 256 ? 256 : remaining;
    if (getentropy(cursor, chunk) != 0) return -1;
    cursor += chunk;
    remaining -= chunk;
  }
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
  if (signal_number != SIGINT) return unavailable();
  const int foreground = (int)atomic_load_explicit(
      &display_mailbox.foreground_pid, memory_order_acquire);
  const int target = pid <= 0 ? foreground : (int)pid;
  if (foreground <= 0 || target != foreground) {
    errno = ESRCH;
    return -1;
  }
  atomic_store_explicit(&display_mailbox.interrupt_target_pid,
                        (uint32_t)target, memory_order_relaxed);
  atomic_fetch_add_explicit(&display_mailbox.interrupt_sequence, 1,
                            memory_order_release);
  emscripten_atomic_notify((void *)&display_mailbox.event_wake,
                           EMSCRIPTEN_NOTIFY_ALL_WAITERS);
  emscripten_atomic_notify((void *)&http_mailbox.state,
                           EMSCRIPTEN_NOTIFY_ALL_WAITERS);
  dolly_interrupt_checkpoint();
  return 0;
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
  static _Atomic uint32_t wait_word;
  double remaining = (double)seconds * 1000.0;
  while (remaining > 0) {
    dolly_interrupt_checkpoint();
    const uint32_t observed = atomic_load_explicit(&wait_word,
                                                   memory_order_relaxed);
    const double interval = remaining > 50.0 ? 50.0 : remaining;
    emscripten_atomic_wait_u32((void *)&wait_word, observed,
                               interval);
    remaining -= interval;
  }
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

static int install_display_driver(void) {
  static const char driver_path[] = "/usr/libexec/dolly/display.wasm";
  static const char font_path[] =
      "/usr/share/fonts/IosevkaTerm-SemiBold.ttf";

  puts("dolly: loading sandbox display driver");
  fflush(stdout);
  if (!dolly_toolchain_validate_executable(driver_path)) {
    fprintf(stderr, "dolly: refusing invalid display module: %s\n", driver_path);
    return 1;
  }
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
  puts("dolly: sandbox display ready");
  fflush(stdout);
  display_driver = candidate;
  return 0;
}

static int spawn_with_deadline(const char *path, int argc, char **argv,
                               int stdin_fd, int stdout_fd, int stderr_fd,
                               double timeout_milliseconds) {
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
  const uint32_t previous_terminal_mask = active_terminal_mask;
  uint32_t child_terminal_mask = 0;
  for (int descriptor = 0; descriptor < 3; descriptor++) {
    const int source = requested[descriptor];
    int terminal = 0;
    if (source >= STDIN_FILENO && source <= STDERR_FILENO) {
      terminal = (previous_terminal_mask & (1u << source)) != 0;
    } else {
      struct stat metadata;
      terminal = fstat(source, &metadata) == 0 && S_ISCHR(metadata.st_mode);
    }
    if (terminal) child_terminal_mask |= 1u << descriptor;
  }
  int status = 126;
  int previous_pid = (int)atomic_load_explicit(&display_mailbox.foreground_pid,
                                                memory_order_acquire);
  int previous_active_pid = active_process_pid;
  const double previous_deadline = active_process_deadline;
  double child_deadline = previous_deadline;
  if (timeout_milliseconds >= 0) {
    const double requested_deadline = emscripten_get_now() + timeout_milliseconds;
    if (child_deadline < 0 || requested_deadline < child_deadline) {
      child_deadline = requested_deadline;
    }
  }
  const int is_interactive_shell = launching_interactive_shell;
  launching_interactive_shell = 0;
  if (is_interactive_shell) interactive_shell_pid = process->pid;

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
    active_terminal_mask = child_terminal_mask;
    active_process_pid = process->pid;
    active_process_deadline = child_deadline;
    atomic_store_explicit(&display_mailbox.foreground_pid, (uint32_t)process->pid,
                          memory_order_release);
    atomic_store_explicit(&display_mailbox.flags,
                          display_flags_for_pid(process->pid),
                          memory_order_release);
    status = dolly_run_filesystem_module(path, argc, argv);
  }

  // A command can never strand the framebuffer. This covers normal return,
  // dolly_exit(), assertion termination, and the SIGINT longjmp boundary.
  release_display_lease_for_pid(process->pid);
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
  active_terminal_mask = previous_terminal_mask;
  active_process_pid = previous_active_pid;
  active_process_deadline = previous_deadline;
  atomic_store_explicit(&display_mailbox.foreground_pid, (uint32_t)previous_pid,
                        memory_order_release);
  atomic_store_explicit(&display_mailbox.flags,
                        display_flags_for_pid(previous_pid),
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

int dolly_spawn(const char *path, int argc, char **argv,
                int stdin_fd, int stdout_fd, int stderr_fd) {
  return spawn_with_deadline(path, argc, argv, stdin_fd, stdout_fd, stderr_fd, -1);
}

int dolly_spawn_timeout(const char *path, int argc, char **argv,
                        int stdin_fd, int stdout_fd, int stderr_fd,
                        double timeout_milliseconds) {
  if (timeout_milliseconds != timeout_milliseconds || timeout_milliseconds < 0 ||
      timeout_milliseconds > 86400000) return -EINVAL;
  return spawn_with_deadline(path, argc, argv, stdin_fd, stdout_fd, stderr_fd,
                             timeout_milliseconds);
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

static char *read_boot_text(const char *path) {
  int descriptor = open(path, O_RDONLY);
  if (descriptor < 0) return NULL;
  struct stat metadata;
  if (fstat(descriptor, &metadata) != 0 || metadata.st_size <= 0 ||
      metadata.st_size > 8192) {
    close(descriptor);
    errno = EINVAL;
    return NULL;
  }
  char *text = malloc((size_t)metadata.st_size + 1);
  if (text == NULL) {
    close(descriptor);
    return NULL;
  }
  size_t offset = 0;
  while (offset < (size_t)metadata.st_size) {
    const ssize_t count = read(descriptor, text + offset,
                               (size_t)metadata.st_size - offset);
    if (count <= 0) {
      free(text);
      close(descriptor);
      return NULL;
    }
    offset += (size_t)count;
  }
  if (close(descriptor) != 0) {
    free(text);
    return NULL;
  }
  text[offset] = '\0';
  while (offset != 0 && (text[offset - 1] == '\n' || text[offset - 1] == '\r')) {
    text[--offset] = '\0';
  }
  if (offset == 0) {
    free(text);
    errno = EINVAL;
    return NULL;
  }
  return text;
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
  if (setenv("ZIG_LIB_DIR", "/usr/lib/zig", 1) != 0) {
    fprintf(stderr, "dolly: ZIG_LIB_DIR initialization failed: %s\n",
            strerror(errno));
    return 1;
  }
  if (setenv("TERM", "xterm-256color", 1) != 0 ||
      setenv("COLORTERM", "truecolor", 1) != 0) {
    fprintf(stderr, "dolly: terminal environment initialization failed: %s\n",
            strerror(errno));
    return 1;
  }
  if (setenv("PI_PACKAGE_DIR", "/usr/lib/pi", 1) != 0) {
    fprintf(stderr, "dolly: Pi package initialization failed: %s\n",
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
  puts("dolly: precompiled system restored");
  fflush(stdout);
  return install_display_driver();
}

EMSCRIPTEN_KEEPALIVE
int dolly_bootstrap(void) {
  if (initialize_boot_environment() != 0) return 1;
  static const struct {
    const char *source;
    const char *output;
  } core_commands[] = {
      {"/usr/src/dolly/slop.c", "/bin/slop"},
      {"/usr/src/dolly/commands/mkdir.c", "/bin/mkdir"},
      {"/usr/src/dolly/commands/rm.c", "/bin/rm"},
      {"/usr/src/dolly/commands/cc.c", "/bin/cc"},
      {"/usr/src/dolly/commands/c++.c", "/bin/c++"},
      {"/usr/src/dolly/commands/ld.c", "/bin/ld"},
      {"/usr/src/dolly/commands/ar.c", "/bin/ar"},
      {"/usr/src/dolly/dollyfile.c", "/bin/dollyfile"},
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
  puts("dolly: installed minimal compiler, Slop, and Dollyfile engine in /bin");

  char *recipe_locator = read_boot_text("/etc/dolly/recipe.locator");
  char *host_base = read_boot_text("/etc/dolly/host.base");
  if (recipe_locator == NULL || host_base == NULL) {
    fprintf(stderr, "dolly: invalid Dollyfile boot configuration: %s\n",
            strerror(errno));
    free(recipe_locator);
    free(host_base);
    return 1;
  }
  char *startup_argv[] = {"dollyfile", recipe_locator, host_base, NULL};
  int startup_pid = dolly_spawn("/bin/dollyfile", 3, startup_argv,
                                STDIN_FILENO, STDOUT_FILENO, STDERR_FILENO);
  if (startup_pid < 0) {
    fprintf(stderr, "dolly: could not launch /bin/dollyfile: %s\n",
            strerror(-startup_pid));
    free(recipe_locator);
    free(host_base);
    return 126;
  }
  int startup_status = 126;
  int wait_status = dolly_wait(startup_pid, &startup_status);
  free(recipe_locator);
  free(host_base);
  if (wait_status != 0) {
    fprintf(stderr, "dolly: could not wait for /bin/dollyfile: %s\n",
            strerror(-wait_status));
    return 126;
  }
  if (startup_status != 0) return startup_status;
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int dolly_bootstrap_finish(void) {
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

static char **load_image_entry(int *argc_out) {
  *argc_out = 0;
  int descriptor = open("/etc/dolly/entry", O_RDONLY);
  if (descriptor < 0) return NULL;
  struct stat metadata;
  if (fstat(descriptor, &metadata) != 0 || metadata.st_size < 16 ||
      metadata.st_size > 64 * 1024) {
    close(descriptor);
    errno = EINVAL;
    return NULL;
  }
  unsigned char *bytes = malloc((size_t)metadata.st_size);
  if (bytes == NULL) {
    close(descriptor);
    return NULL;
  }
  size_t offset = 0;
  while (offset < (size_t)metadata.st_size) {
    const ssize_t count = read(descriptor, bytes + offset,
                               (size_t)metadata.st_size - offset);
    if (count <= 0) {
      free(bytes);
      close(descriptor);
      return NULL;
    }
    offset += (size_t)count;
  }
  if (close(descriptor) != 0 || memcmp(bytes, "DOLLYENT", 8) != 0) {
    free(bytes);
    errno = EINVAL;
    return NULL;
  }
  const unsigned char *cursor = bytes + 8;
  const unsigned char *end = bytes + metadata.st_size;
  int valid = 1;
  const uint32_t version = take_entry_u32(&cursor, end, &valid);
  const uint32_t count = take_entry_u32(&cursor, end, &valid);
  if (!valid || version != 1 || count == 0 || count > 256) {
    free(bytes);
    errno = EINVAL;
    return NULL;
  }
  char **arguments = calloc((size_t)count + 1, sizeof(*arguments));
  if (arguments == NULL) {
    free(bytes);
    return NULL;
  }
  for (uint32_t index = 0; index < count; ++index) {
    const uint32_t length = take_entry_u32(&cursor, end, &valid);
    if (!valid || length == 0 || length > 4096 ||
        (size_t)(end - cursor) < length || memchr(cursor, '\0', length) != NULL) {
      valid = 0;
      break;
    }
    arguments[index] = malloc((size_t)length + 1);
    if (arguments[index] == NULL) {
      valid = 0;
      break;
    }
    memcpy(arguments[index], cursor, length);
    arguments[index][length] = '\0';
    cursor += length;
  }
  free(bytes);
  if (!valid || cursor != end || arguments[0] == NULL || arguments[0][0] != '/') {
    for (uint32_t index = 0; index < count; ++index) free(arguments[index]);
    free(arguments);
    errno = EINVAL;
    return NULL;
  }
  *argc_out = (int)count;
  return arguments;
}

static void dispose_image_entry(char **arguments, int count) {
  if (arguments == NULL) return;
  for (int index = 0; index < count; ++index) free(arguments[index]);
  free(arguments);
}

EMSCRIPTEN_KEEPALIVE
int dolly_shell_run(void) {
  // Pi is Dolly's primary agent-facing interface. It is the first resident
  // terminal program, and a plain Slop shell remains available as a recovery
  // environment after Pi exits. Both are ordinary filesystem executables.
  int entry_argc = 0;
  char **entry_argv = load_image_entry(&entry_argc);
  if (entry_argv == NULL) {
    fprintf(stderr, "dolly: invalid image ENTRY: %s\n", strerror(errno));
    return 126;
  }
  launching_interactive_shell = 1;
  int pid = dolly_spawn(entry_argv[0], entry_argc, entry_argv,
                        STDIN_FILENO, STDOUT_FILENO, STDERR_FILENO);
  launching_interactive_shell = 0;
  if (pid < 0) {
    fprintf(stderr, "dolly: could not launch %s: %s\n",
            entry_argv[0], strerror(-pid));
  } else {
    int status = 126;
    int wait_status = dolly_wait(pid, &status);
    if (wait_status != 0) {
      fprintf(stderr, "dolly: could not wait for %s: %s\n",
              entry_argv[0],
              strerror(-wait_status));
    }
  }
  dispose_image_entry(entry_argv, entry_argc);

  fputs("\r\nDolly: Pi exited; entering the recovery Slop shell.\r\n", stdout);
  char *slop_argv[] = {"slop", NULL};
  launching_interactive_shell = 1;
  pid = dolly_spawn("/bin/slop", 1, slop_argv,
                    STDIN_FILENO, STDOUT_FILENO, STDERR_FILENO);
  launching_interactive_shell = 0;
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
