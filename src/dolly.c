#include <errno.h>
#include <dirent.h>
#include <fcntl.h>
#include <limits.h>
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

#include <dolly/display.h>
#include <dolly/http.h>
#include <dolly/runtime.h>

#include "fs-record.h"
#include "process-kernel.h"
#include "session-snapshot.h"
#include "system-snapshot.h"

enum {
  DOLLY_HTTP_MAILBOX_VERSION = 5,
  DOLLY_HTTP_MAILBOX_HEADER_SIZE = 64,
};

static uint32_t consumed_interrupt_sequence;
static uint32_t terminal_mode_flags =
    DOLLY_TERMINAL_CANONICAL | DOLLY_TERMINAL_ECHO |
    DOLLY_TERMINAL_OPOST | DOLLY_TERMINAL_ONLCR;

_Static_assert((DOLLY_DISPLAY_EVENT_CAPACITY &
                (DOLLY_DISPLAY_EVENT_CAPACITY - 1)) == 0,
               "display event capacity must be a power of two");

_Alignas(64) static dolly_display_mailbox display_mailbox;
static const dolly_display_driver_v3 *display_driver;
static unsigned char *display_module_bytes;
static uintptr_t display_module_length;
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

_Alignas(64) static dolly_http_mailbox http_mailboxes[DOLLY_HTTP_SLOT_COUNT];
static uint32_t next_http_slot;

static unsigned char encoded_input[256];
static size_t encoded_input_length;
static size_t encoded_input_cursor;

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
  memset(&display_lease, 0, sizeof(display_lease));
  // Events published while the graphics owner was active belong to that
  // ownership epoch and must not leak into the restored shell.
  dolly_terminal_discard_pending_input();
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

// The trusted host registry supplies these typed imports. The generated
// Emscripten binding fails closed if a host omits that step.
DOLLY_EM_JS(int, dolly_http_dispatch,
      (const char *method, uintptr_t method_size,
       const char *url, uintptr_t url_size,
       const char *headers, uintptr_t headers_size,
       const void *body, uintptr_t body_size, uint32_t flags,
       uint32_t sequence), { return -ENOSYS; });
DOLLY_EM_JS(int, dolly_download_dispatch,
      (const unsigned char *name, uintptr_t name_length,
       const unsigned char *bytes, uintptr_t length), { return -ENOSYS; });

uintptr_t dolly_display_mailbox_address(void) {
  return (uintptr_t)&display_mailbox;
}

uint32_t dolly_display_mailbox_version(void) {
  return DOLLY_DISPLAY_MAILBOX_VERSION;
}

uint32_t dolly_display_event_size(void) {
  return DOLLY_DISPLAY_EVENT_SIZE;
}

uint32_t dolly_display_event_capacity(void) {
  return DOLLY_DISPLAY_EVENT_CAPACITY;
}

uintptr_t dolly_display_framebuffer_address(uint32_t index) {
  return index < DOLLY_DISPLAY_FRAME_COUNT
      ? (uintptr_t)display_frames[index] : 0;
}

uintptr_t dolly_display_framebuffer_capacity(void) {
  return display_frame_capacity;
}

uintptr_t dolly_display_paste_buffer_address(void) {
  return (uintptr_t)display_paste_buffer;
}

uintptr_t dolly_display_copy_buffer_address(void) {
  return (uintptr_t)display_copy_buffer;
}

uint32_t dolly_display_clipboard_capacity(void) {
  return DOLLY_DISPLAY_CLIPBOARD_CAPACITY;
}

uintptr_t dolly_http_mailbox_address(void) {
  return (uintptr_t)http_mailboxes;
}

uint32_t dolly_http_slot_count(void) {
  return DOLLY_HTTP_SLOT_COUNT;
}

uint32_t dolly_http_mailbox_version(void) {
  return DOLLY_HTTP_MAILBOX_VERSION;
}

uint32_t dolly_http_chunk_capacity(void) {
  return DOLLY_HTTP_CHUNK_CAPACITY;
}

int dolly_http_start(const char *method, const char *url, const char *headers,
                     const void *body, size_t body_size, unsigned int flags,
                     unsigned int *sequence_out) {
  const unsigned int valid_flags = DOLLY_HTTP_FAIL_STATUS | DOLLY_HTTP_FOLLOW_REDIRECTS;
  if (method == NULL || url == NULL || sequence_out == NULL ||
      method[0] == '\0' || url[0] == '\0' || (flags & ~valid_flags) != 0 ||
      (body_size != 0 && body == NULL)) return -EINVAL;

  for (uint32_t attempt = 0; attempt < DOLLY_HTTP_SLOT_COUNT; ++attempt) {
    const uint32_t index = next_http_slot++ % DOLLY_HTTP_SLOT_COUNT;
    dolly_http_mailbox *mailbox = &http_mailboxes[index];
    uint32_t sequence = atomic_load_explicit(&mailbox->sequence, memory_order_acquire);
    // Never wrap a handle and let a stale caller address a later request.
    if (sequence > UINT32_MAX - DOLLY_HTTP_SLOT_COUNT) continue;
    uint32_t expected = 0;
    if (!atomic_compare_exchange_strong_explicit(
            &mailbox->state, &expected, 1,
            memory_order_acq_rel, memory_order_acquire)) continue;
    sequence = sequence == 0 ? index + 1 : sequence + DOLLY_HTTP_SLOT_COUNT;
    atomic_store_explicit(&mailbox->sequence, sequence, memory_order_release);
    atomic_store_explicit(&mailbox->status, 0, memory_order_relaxed);
    atomic_store_explicit(&mailbox->length, 0, memory_order_relaxed);
    atomic_store_explicit(&mailbox->eof, 0, memory_order_relaxed);
    atomic_store_explicit(&mailbox->error, 0, memory_order_relaxed);
    atomic_store_explicit(&mailbox->kind, 0, memory_order_relaxed);
    const int admitted = dolly_http_dispatch(
        method, strlen(method), url, strlen(url),
        headers, headers == NULL ? 0 : strlen(headers),
        body, body_size, flags, sequence);
    if (admitted == 0) { *sequence_out = sequence; return 0; }
    atomic_store_explicit(&mailbox->state, 0, memory_order_release);
    // A cancelled provider can still be settling in this browser slot.
    if (admitted != -EBUSY) return admitted;
  }
  return -EBUSY;
}

int dolly_http_poll(unsigned int sequence, dolly_http_chunk *chunk,
                    void *data, size_t capacity) {
  if (chunk == NULL || (capacity != 0 && data == NULL)) return -EINVAL;
  if (sequence == 0) return -ESTALE;
  dolly_http_mailbox *mailbox = &http_mailboxes[(sequence - 1) % DOLLY_HTTP_SLOT_COUNT];
  if (atomic_load_explicit(&mailbox->sequence, memory_order_acquire) != sequence) return -ESTALE;
  const uint32_t state = atomic_load_explicit(&mailbox->state, memory_order_acquire);
  if (state == 0) return -ESTALE;
  if (state == 3) {
    *chunk = (dolly_http_chunk){
        .status = atomic_load_explicit(&mailbox->status, memory_order_relaxed),
        .error = atomic_load_explicit(&mailbox->error, memory_order_relaxed),
        .kind = 3, .eof = 1};
    atomic_store_explicit(&mailbox->state, 0, memory_order_release);
    return 1;
  }
  if (state != 2) return 0;

  const uint32_t length = atomic_load_explicit(&mailbox->length, memory_order_relaxed);
  *chunk = (dolly_http_chunk){
      .status = atomic_load_explicit(&mailbox->status, memory_order_relaxed),
      .kind = atomic_load_explicit(&mailbox->kind, memory_order_relaxed),
      .error = atomic_load_explicit(&mailbox->error, memory_order_relaxed),
      .eof = atomic_load_explicit(&mailbox->eof, memory_order_relaxed),
      .length = length};
  if (length > DOLLY_HTTP_CHUNK_CAPACITY || length > capacity) return -EOVERFLOW;
  if (length != 0) memcpy(data, mailbox->data, length);
  uint32_t readable = 2;
  atomic_compare_exchange_strong_explicit(
      &mailbox->state, &readable, chunk->eof ? 0 : 1,
      memory_order_release, memory_order_relaxed);
  emscripten_atomic_notify((void *)&mailbox->state, EMSCRIPTEN_NOTIFY_ALL_WAITERS);
  return 1;
}

int dolly_http_cancel(unsigned int sequence) {
  if (sequence == 0) return -ESTALE;
  dolly_http_mailbox *mailbox = &http_mailboxes[(sequence - 1) % DOLLY_HTTP_SLOT_COUNT];
  if (atomic_load_explicit(&mailbox->sequence, memory_order_acquire) != sequence) return -ESTALE;
  const int result = dolly_http_dispatch(NULL, 0, NULL, 0, NULL, 0, NULL, 0, 0, sequence);
  if (result != 0) return result;
  atomic_store_explicit(&mailbox->state, 0, memory_order_release);
  emscripten_atomic_notify((void *)&mailbox->state, EMSCRIPTEN_NOTIFY_ALL_WAITERS);
  return 0;
}

static int handle_terminal_event(const dolly_input_event *event,
                                  unsigned char *output, size_t capacity,
                                  size_t *length) {
  const uint32_t columns = atomic_load(&display_mailbox.terminal_cols);
  const uint32_t rows = atomic_load(&display_mailbox.terminal_rows);
  const int result = display_driver->handle_event(event, output, capacity, length);
  if (result == 0 && event != NULL && event->type == DOLLY_INPUT_EVENT_RESIZE &&
      (columns != atomic_load(&display_mailbox.terminal_cols) ||
       rows != atomic_load(&display_mailbox.terminal_rows)))
    dolly_kernel_terminal_resized();
  return result;
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
        handle_terminal_event(NULL, encoded_input,
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
          handle_terminal_event(&event, encoded_input,
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
  if (cursor > DOLLY_DISPLAY_CURSOR_CAPTURED) return -EINVAL;
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
    if (handle_terminal_event(NULL, ignored, sizeof(ignored),
                                     &ignored_length) != 0) {
      return -EIO;
    }
  } while (ignored_length != 0);
  if (handle_terminal_event(event, ignored, sizeof(ignored),
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

void dolly_terminal_discard_pending_input(void) {
  // An application may return immediately on a key-down event while the
  // matching key-up record is already queued. That record belongs to the old
  // foreground command or display owner and must not become input to its
  // successor. Preserve resize records so Ghostty adopts the current geometry.
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
}

void dolly_terminal_publish_result(int status) {
  atomic_store_explicit(&display_mailbox.result_status, (uint32_t)status,
                        memory_order_release);
  atomic_fetch_add_explicit(&display_mailbox.result_sequence, 1,
                            memory_order_acq_rel);
  emscripten_atomic_notify((void *)&display_mailbox.result_sequence,
                           EMSCRIPTEN_NOTIFY_ALL_WAITERS);
}

/* The process kernel owns foreground policy; the browser only reads this
 * mailbox and publishes interrupts addressed to the displayed owner. */
void dolly_kernel_foreground_publish(int pid, int interruptible) {
  const uint32_t previous = atomic_load_explicit(
      &display_mailbox.foreground_pid, memory_order_acquire);
  if (previous != 0 && previous != (uint32_t)pid) {
    release_display_lease_for_pid((int)previous);
  }
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
}

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

uint32_t dolly_kernel_terminal_mode(void) {
  return terminal_mode_flags;
}

int dolly_kernel_terminal_set_mode(uint32_t flags) {
  const uint32_t valid = DOLLY_TERMINAL_CANONICAL | DOLLY_TERMINAL_ECHO |
      DOLLY_TERMINAL_OPOST | DOLLY_TERMINAL_ONLCR;
  if ((flags & ~valid) != 0) return -EINVAL;
  terminal_mode_flags = flags;
  return 0;
}

void dolly_terminal_write_bytes(const unsigned char *bytes, uintptr_t length) {
  if (bytes == NULL || length == 0) return;
  if (display_driver != NULL) {
    const uint32_t newline = DOLLY_TERMINAL_OPOST | DOLLY_TERMINAL_ONLCR;
    if ((terminal_mode_flags & newline) == newline) {
      uintptr_t start = 0;
      for (uintptr_t index = 0; index < length; ++index) {
        if (bytes[index] != '\n') continue;
        if (index > start) display_driver->write(bytes + start, index - start);
        display_driver->write((const unsigned char *)"\r\n", 2);
        start = index + 1;
      }
      bytes += start;
      length -= start;
    }
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
int dolly_terminal_present_pending(void) {
  if (display_driver == NULL || display_lease.generation != 0) return 0;
  unsigned char preserved;
  size_t output_length = 0;
  uint32_t read = atomic_load_explicit(&display_mailbox.event_read,
                                       memory_order_relaxed);
  const uint32_t write = atomic_load_explicit(&display_mailbox.event_write,
                                             memory_order_acquire);
  if (write - read > DOLLY_DISPLAY_EVENT_CAPACITY) return -EPROTO;
  // UI intent is independent of stdin. Zero marks a consumed UI slot.
  for (uint32_t cursor = read; cursor != write; ++cursor) {
    dolly_input_event *event = &display_mailbox.events[
        cursor & (DOLLY_DISPLAY_EVENT_CAPACITY - 1)];
    if (event->type == DOLLY_INPUT_EVENT_POINTER_MOTION ||
        event->type == DOLLY_INPUT_EVENT_POINTER_CAPTURE ||
        event->type == DOLLY_INPUT_EVENT_POINTER_PRESENCE) {
      event->type = 0;
      continue;
    }
    if (event->type == DOLLY_INPUT_EVENT_RESIZE ||
        event->type == DOLLY_INPUT_EVENT_POINTER ||
        event->type == DOLLY_INPUT_EVENT_SCROLL) {
      (void)handle_terminal_event(event, &preserved, 0, &output_length);
      event->type = 0;
    }
  }
  // Compact remaining input toward the published tail, in order, before
  // releasing slots. The producer cannot overwrite this range until read is
  // advanced. Thus UI traffic cannot fill the ring behind an unread key/paste.
  uint32_t retained = write;
  for (uint32_t cursor = write; cursor != read;) {
    const dolly_input_event event = display_mailbox.events[
        --cursor & (DOLLY_DISPLAY_EVENT_CAPACITY - 1)];
    if (event.type != 0) {
      --retained;
      if (retained != cursor) display_mailbox.events[
          retained & (DOLLY_DISPLAY_EVENT_CAPACITY - 1)] = event;
    }
  }
  atomic_store_explicit(&display_mailbox.event_read, retained, memory_order_release);
  return handle_terminal_event(
      NULL, &preserved, 0, &output_length);
}

// Processes reach the terminal through their own descriptors, and /dev/stdin
// resolves to descriptor 0, so the kernel never reads WasmFS stdin. Defining
// this device callback keeps Emscripten's JavaScript fallback out of the
// kernel's imports.
int _wasmfs_stdin_get_char(void) { return -1; }

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
  if (path == NULL || path[0] == '\0') return -EINVAL;
  const char *name = strrchr(path, '/');
  name = name == NULL ? path : name + 1;
  const size_t name_length = strlen(name);
  if (name_length == 0 || name_length > 255 || strcmp(name, ".") == 0 ||
      strcmp(name, "..") == 0) return -EINVAL;
  unsigned char *contents;
  uintptr_t length;
  if (dolly_fs_read_file(path, 64 * 1024 * 1024, &contents, &length) != 0) return -errno;
  const int status = dolly_download_dispatch((const unsigned char *)name, name_length,
                                             contents, length);
  free(contents);
  return status;
}

int dolly_display_prepare(void) {
  const char *driver_path = getenv("DISPLAY");
  if (driver_path == NULL || driver_path[0] != '/') {
    fputs("dolly: DISPLAY must name an absolute shared-library path\n", stderr);
    return 1;
  }

  printf("dolly: preparing sandbox display library %s\n", driver_path);
  fflush(stdout);
  free(display_module_bytes);
  const int status = dolly_fs_read_file(driver_path, 64 * 1024 * 1024,
                                        &display_module_bytes, &display_module_length);
  if (status != 0 || display_module_length < 8) {
    fprintf(stderr, "dolly: invalid display library: %s\n",
            status != 0 ? strerror(errno) : "too short");
    free(display_module_bytes);
    display_module_bytes = NULL;
    display_module_length = 0;
    return 1;
  }
  return 0;
}

uintptr_t dolly_display_module_address(void) {
  return (uintptr_t)display_module_bytes;
}

uintptr_t dolly_display_module_size(void) {
  return display_module_length;
}

int dolly_display_install(const dolly_display_driver_v3 *candidate) {
  static const char font_path[] = "/usr/share/fonts/IosevkaTerm-SemiBold.ttf";
  if (display_driver != NULL || candidate == NULL || candidate->abi_version != 3 ||
      candidate->struct_size < sizeof(*candidate) ||
      candidate->initialize == NULL || candidate->write == NULL ||
      candidate->handle_event == NULL || candidate->set_suspended == NULL) {
    fputs("dolly: incompatible sandbox display driver\n", stderr);
    return 1;
  }
  free(display_module_bytes);
  display_module_bytes = NULL;
  display_module_length = 0;
  for (size_t index = 0; index < DOLLY_DISPLAY_FRAME_COUNT; ++index) {
    display_frames[index] = malloc(display_frame_capacity);
    if (display_frames[index] == NULL) {
      fputs("dolly: could not allocate sandbox framebuffer\n", stderr);
      return 1;
    }
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
    if (count <= 0 || dolly_fs_write_exact(output, bytes, (uintptr_t)count) != 0) {
      status = count == 0 ? 0 : -1;
      break;
    }
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

  if (mkdir("/bin", 0755) != 0 && errno != EEXIST) {
    fprintf(stderr, "dolly: mkdir /bin failed: %s\n", strerror(errno));
    return 1;
  }
  if (mkdir("/tmp", 0755) != 0 && errno != EEXIST) {
    fprintf(stderr, "dolly: mkdir /tmp failed: %s\n", strerror(errno));
    return 1;
  }
  if (mkdir("/workspace", 0755) != 0 && errno != EEXIST) {
    fprintf(stderr, "dolly: mkdir /workspace failed: %s\n", strerror(errno));
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

int dolly_process_bootstrap_prepare(void) {
  if (initialize_boot_environment() != 0) return 1;
  if (install_seed_tree("/seed/usr", "/usr") != 0) {
    fprintf(stderr, "dolly: could not install compiler seed: %s\n", strerror(errno));
    return 1;
  }
  return 0;
}

int dolly_process_bootstrap_resume_prepare(uintptr_t size,
                                           uint32_t resume_uses) {
  if (resume_uses != 1 || initialize_boot_environment() != 0) return 1;
  puts("dolly: restoring image builder");
  fflush(stdout);
  if (dolly_snapshot_restore_staged(size, "/bin/dollyfile") != 0) {
    fprintf(stderr, "dolly: invalid base image artifact: %s\n",
            strerror(errno));
    return 1;
  }
  return 0;
}

int dolly_bootstrap_snapshot_begin(uintptr_t size) {
  if (initialize_boot_environment() != 0) return 1;
  return dolly_snapshot_stream_begin(size) != 0;
}

int dolly_bootstrap_snapshot(uintptr_t size) {
  if (initialize_boot_environment() != 0) return 1;
  puts("dolly: restoring precompiled system snapshot");
  fflush(stdout);
  if (dolly_snapshot_restore_staged(size, NULL) != 0) {
    fprintf(stderr, "dolly: invalid system snapshot: %s\n", strerror(errno));
    return 1;
  }
  if (load_image_environment() != 0) {
    fprintf(stderr, "dolly: invalid image environment: %s\n", strerror(errno));
    return 1;
  }
  puts("dolly: precompiled system restored");
  fflush(stdout);
  return dolly_snapshot_prune() != 0;
}

int dolly_bootstrap_finish(void) {
  if (load_image_environment() != 0) {
    fprintf(stderr, "dolly: invalid built image environment: %s\n",
            strerror(errno));
    return 1;
  }
  return dolly_snapshot_prune() != 0;
}

int dolly_bootstrap_snapshot_end(void) {
  if (dolly_snapshot_stream_finish() != 0) {
    fprintf(stderr, "dolly: invalid streamed system snapshot: %s\n", strerror(errno));
    return 1;
  }
  return dolly_bootstrap_finish();
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
  unsigned char *bytes;
  uintptr_t size;
  if (dolly_fs_read_file("/etc/dolly/environment", 128 * 1024, &bytes, &size) != 0) return -1;
  if (size < 16 || memcmp(bytes, "DOLLYENV", 8) != 0) {
    free(bytes);
    errno = EINVAL;
    return -1;
  }
  const unsigned char *cursor = bytes + 8;
  const unsigned char *end = bytes + size;
  uint32_t version = 0, count = 0;
  int error = dolly_fs_take_u32(&cursor, end, &version) != 0 ||
      dolly_fs_take_u32(&cursor, end, &count) != 0 || version != 1 || count > 256 ? EINVAL : 0;
  for (uint32_t index = 0; error == 0 && index < count; ++index) {
    uint32_t name_length, value_length;
    const unsigned char *name, *value;
    if (dolly_fs_take_u32(&cursor, end, &name_length) != 0 ||
        dolly_fs_take_u32(&cursor, end, &value_length) != 0 ||
        value_length > 64 * 1024 ||
        dolly_fs_take_bytes(&cursor, end, name_length, &name) != 0 ||
        dolly_fs_take_bytes(&cursor, end, value_length, &value) != 0 ||
        !valid_environment_name_bytes(name, name_length) ||
        memchr(value, '\0', value_length) != NULL) {
      error = EINVAL;
      break;
    }
    char *entry_name = strndup((const char *)name, name_length);
    char *entry_value = strndup((const char *)value, value_length);
    if (entry_name == NULL || entry_value == NULL) error = ENOMEM;
    else if (setenv(entry_name, entry_value, 1) != 0) error = errno;
    free(entry_name);
    free(entry_value);
  }
  free(bytes);
  if (error == 0 && cursor != end) error = EINVAL;
  if (error != 0) {
    errno = error;
    return -1;
  }
  return 0;
}

int main(void) {
  return 0;
}
