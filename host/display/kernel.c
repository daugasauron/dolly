// display@0 kernel side: the terminal device drawn by the image's display
// library, and the framebuffer lease that a foreground graphics program takes
// over from it.
#include "fs-record.h"
#include "process-kernel.h"

#include <dolly/display.h>
#include <dolly/process.h>
#include <dolly/runtime.h>
#include <errno.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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

static unsigned char encoded_input[256];
static size_t encoded_input_length;
static size_t encoded_input_cursor;

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

// Buffers decoded terminal input bytes; returns 1 when some are ready and -1
// otherwise. The kernel thread never waits for input.
static int fill_terminal_input(void) {
  for (;;) {
    // A graphics owner consumes semantic records through
    // dolly_display_next_event. No terminal reader may race it for the shared
    // single-consumer event ring.
    if (display_lease.generation != 0) return -1;
    if (encoded_input_cursor < encoded_input_length) return 1;
    encoded_input_cursor = 0;
    encoded_input_length = 0;

    if (display_driver != NULL &&
        handle_terminal_event(NULL, encoded_input, sizeof(encoded_input),
                              &encoded_input_length) == 0 &&
        encoded_input_length != 0) continue;

    uint32_t read = atomic_load_explicit(&display_mailbox.event_read,
                                         memory_order_relaxed);
    uint32_t write = atomic_load_explicit(&display_mailbox.event_write,
                                          memory_order_acquire);
    if (read == write) return -1;
    dolly_input_event event =
        display_mailbox.events[read & (DOLLY_DISPLAY_EVENT_CAPACITY - 1)];
    atomic_store_explicit(&display_mailbox.event_read, read + 1,
                          memory_order_release);
    if (display_driver == NULL ||
        handle_terminal_event(&event, encoded_input, sizeof(encoded_input),
                              &encoded_input_length) != 0) {
      encoded_input_length = 0;
    }
  }
}

int dolly_kernel_terminal_ready(void) {
  return fill_terminal_input() > 0;
}

int dolly_kernel_terminal_read(void) {
  if (fill_terminal_input() <= 0) return -1;
  return encoded_input[encoded_input_cursor++];
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
  const int foreground = dolly_kernel_foreground();
  return pid > 0 && foreground > 0 &&
      dolly_process_descends_from(pid, foreground);
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

void dolly_kernel_terminal_release(int pid) {
  release_display_lease_for_pid(pid);
}

int dolly_kernel_terminal_attached(void) {
  return display_driver != NULL;
}

void dolly_kernel_terminal_render(const unsigned char *bytes, size_t length) {
  display_driver->write(bytes, length);
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

// Every surface response describes the current lease.
static int64_t respond_surface(unsigned char *mailbox, uint64_t capacity,
                               uint32_t buffer_index) {
  const dolly_process_display_surface_response response = {
      .generation = display_lease.generation,
      .capacity = capacity,
      .buffer_index = buffer_index,
      .width = display_lease.width,
      .height = display_lease.height,
      .stride = display_lease.stride,
      .pixel_format = DOLLY_DISPLAY_PIXEL_RGBA8,
  };
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t display_acquire_packet(int pid, unsigned char *mailbox,
                                      uintptr_t request_size,
                                      uintptr_t response_capacity) {
  if (request_size != 0 ||
      response_capacity < sizeof(dolly_process_display_surface_response)) {
    return -EINVAL;
  }
  if (display_driver == NULL || display_frames[0] == NULL ||
      display_frames[1] == NULL) {
    return -ENODEV;
  }
  if (!process_may_acquire_display(pid)) return -EPERM;
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
  display_lease.owner_pid = pid;
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
  return respond_surface(mailbox, 0, 0);
}

static int64_t display_set_size_packet(int pid, unsigned char *mailbox,
                                       uintptr_t request_size,
                                       uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_size_request) ||
      response_capacity < sizeof(dolly_process_display_surface_response)) {
    return -EINVAL;
  }
  dolly_process_display_size_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.width == 0 || request.height == 0 ||
      request.width > DOLLY_DISPLAY_MAX_WIDTH ||
      request.height > DOLLY_DISPLAY_MAX_HEIGHT ||
      (uint64_t)request.width * request.height * 4u > display_frame_capacity) {
    return -EINVAL;
  }
  const int status = validate_display_lease(pid, request.generation);
  if (status != 0) return status;
  display_lease.width = request.width;
  display_lease.height = request.height;
  display_lease.stride = request.width * 4u;
  return respond_surface(mailbox, 0, 0);
}

static int64_t display_begin_frame_packet(int pid, unsigned char *mailbox,
                                          uintptr_t request_size,
                                          uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_generation_request) ||
      response_capacity < sizeof(dolly_process_display_surface_response)) {
    return -EINVAL;
  }
  dolly_process_display_generation_request request;
  memcpy(&request, mailbox, sizeof(request));
  const int status = validate_display_lease(pid, request.generation);
  if (status != 0) return status;
  const uint64_t length = (uint64_t)display_lease.stride * display_lease.height;
  if (display_lease.width == 0 || display_lease.height == 0 ||
      display_lease.stride != display_lease.width * 4u ||
      length > display_frame_capacity) {
    return -EIO;
  }
  const uint32_t active = atomic_load_explicit(&display_mailbox.frame_index,
                                                memory_order_acquire) & 1u;
  display_lease.staging_buffer = active ^ 1u;
  display_lease.staging_offset = 0;
  display_lease.staging = 1;
  return respond_surface(mailbox, length, display_lease.staging_buffer);
}

static int64_t display_write_frame_packet(int pid, unsigned char *mailbox,
                                          uintptr_t request_size,
                                          uintptr_t response_capacity) {
  if (request_size < sizeof(dolly_process_display_write_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_process_display_write_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.reserved != 0 || request.size > SIZE_MAX ||
      request.offset > SIZE_MAX ||
      request.size != request_size - sizeof(request)) return -EINVAL;
  const int status = validate_display_lease(pid, request.generation);
  if (status != 0) return status;
  const size_t capacity = (size_t)display_lease.stride * display_lease.height;
  const size_t offset = (size_t)request.offset, size = (size_t)request.size;
  if (!display_lease.staging ||
      request.buffer_index != display_lease.staging_buffer ||
      offset != display_lease.staging_offset || offset > capacity ||
      size > capacity - offset) {
    return -EINVAL;
  }
  memcpy(display_frames[request.buffer_index] + offset,
         mailbox + sizeof(request), size);
  display_lease.staging_offset += size;
  return 0;
}

static int64_t display_present_packet(int pid, unsigned char *mailbox,
                                      uintptr_t request_size,
                                      uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_present_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_process_display_present_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.reserved != 0) return -EINVAL;
  const int status = validate_display_lease(pid, request.generation);
  if (status != 0) return status;
  const uint32_t active = atomic_load_explicit(&display_mailbox.frame_index,
                                                memory_order_acquire) & 1u;
  const uint32_t buffer_index = request.buffer_index;
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

static int64_t display_wait_frame_packet(int pid, unsigned char *mailbox,
                                         uintptr_t request_size,
                                         uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_wait_request) ||
      response_capacity < sizeof(dolly_process_display_wait_response)) {
    return -EINVAL;
  }
  dolly_process_display_wait_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.reserved != 0) return -EINVAL;
  const int status = validate_display_lease(pid, request.generation);
  if (status != 0) return status;
  const uint32_t sequence = atomic_load_explicit(
      &display_mailbox.animation_frame_sequence, memory_order_acquire);
  const int changed = sequence != request.sequence;
  if (!changed && dolly_kernel_deadline_pending(request.deadline_nanoseconds)) {
    return DOLLY_PROCESS_DISPATCH_DEFERRED;
  }
  const dolly_process_display_wait_response response = {changed, sequence};
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t display_set_cursor_packet(int pid, unsigned char *mailbox,
                                         uintptr_t request_size,
                                         uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_cursor_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_process_display_cursor_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.reserved != 0) return -EINVAL;
  const int status = validate_display_lease(pid, request.generation);
  if (status != 0) return status;
  if (request.cursor > DOLLY_DISPLAY_CURSOR_CAPTURED) return -EINVAL;
  atomic_store_explicit(&display_mailbox.cursor_style, request.cursor,
                        memory_order_release);
  return 0;
}

static int64_t display_next_event_packet(int pid, unsigned char *mailbox,
                                         uintptr_t request_size,
                                         uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_event_request) ||
      response_capacity < sizeof(dolly_process_display_event_response)) {
    return -EINVAL;
  }
  dolly_process_display_event_request request;
  memcpy(&request, mailbox, sizeof(request));
  int status = validate_display_lease(pid, request.generation);
  if (status != 0) return status;
  dolly_process_display_event_response response = {0};
  const uint32_t read = atomic_load_explicit(&display_mailbox.event_read,
                                              memory_order_relaxed);
  const uint32_t write = atomic_load_explicit(&display_mailbox.event_write,
                                               memory_order_acquire);
  if (read == write) {
    if (dolly_kernel_deadline_pending(request.deadline_nanoseconds)) {
      return DOLLY_PROCESS_DISPATCH_DEFERRED;
    }
    return dolly_kernel_respond(mailbox, &response, sizeof(response));
  }
  const dolly_input_event event =
      display_mailbox.events[read & (DOLLY_DISPLAY_EVENT_CAPACITY - 1)];
  atomic_store_explicit(&display_mailbox.event_read, read + 1,
                        memory_order_release);
  const size_t data_length = (size_t)event.key_length +
                             event.code_length + event.text_length;
  if (data_length > sizeof(event.data)) return -EPROTO;
  status = update_suspended_terminal_layout(&event);
  if (status != 0) return status;
  _Static_assert(sizeof(response.event) == sizeof(event),
                 "process/display event layouts diverged");
  response.result = 1;
  memcpy(response.event, &event, sizeof(event));
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t display_release_packet(int pid, unsigned char *mailbox,
                                      uintptr_t request_size,
                                      uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_process_display_generation_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_process_display_generation_request request;
  memcpy(&request, mailbox, sizeof(request));
  const int status = validate_display_lease(pid, request.generation);
  if (status != 0) return status;
  release_display_lease_for_pid(pid);
  return 0;
}

static int64_t display_call(int pid, int tid, uint32_t operation, unsigned char *mailbox,
                            uintptr_t request_size, uintptr_t response_capacity) {
  switch (operation) {
    case DOLLY_PROCESS_DISPLAY_ACQUIRE:
      return display_acquire_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_SET_SIZE:
      return display_set_size_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_BEGIN_FRAME:
      return display_begin_frame_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_WRITE_FRAME:
      return display_write_frame_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_PRESENT:
      return display_present_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_WAIT_FRAME:
      return display_wait_frame_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_SET_CURSOR:
      return display_set_cursor_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_NEXT_EVENT:
      return display_next_event_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_PROCESS_DISPLAY_RELEASE:
      return display_release_packet(pid, mailbox, request_size, response_capacity);
  }
  return -EINVAL;
}

static void display_release(int pid, int tid) {
  if (tid == 0) release_display_lease_for_pid(pid);
}

const dolly_kernel_module dolly_display_kernel = {
    DOLLY_PROCESS_DISPLAY_ACQUIRE, DOLLY_PROCESS_DISPLAY_RELEASE, display_call, display_release};
