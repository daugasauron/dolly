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
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

_Static_assert(
    offsetof(dolly_display_mailbox, flags) == 4 * DOLLY_DISPLAY_WORD_FLAGS &&
    offsetof(dolly_display_mailbox, frame_sequence) == 4 * DOLLY_DISPLAY_WORD_FRAME_SEQUENCE &&
    offsetof(dolly_display_mailbox, frame_index) == 4 * DOLLY_DISPLAY_WORD_FRAME_INDEX &&
    offsetof(dolly_display_mailbox, frame_width) == 4 * DOLLY_DISPLAY_WORD_FRAME_WIDTH &&
    offsetof(dolly_display_mailbox, frame_height) == 4 * DOLLY_DISPLAY_WORD_FRAME_HEIGHT &&
    offsetof(dolly_display_mailbox, frame_stride) == 4 * DOLLY_DISPLAY_WORD_FRAME_STRIDE &&
    offsetof(dolly_display_mailbox, terminal_cols) == 4 * DOLLY_DISPLAY_WORD_TERMINAL_COLS &&
    offsetof(dolly_display_mailbox, terminal_rows) == 4 * DOLLY_DISPLAY_WORD_TERMINAL_ROWS &&
    offsetof(dolly_display_mailbox, font_size_milli) == 4 * DOLLY_DISPLAY_WORD_FONT_SIZE_MILLI &&
    offsetof(dolly_display_mailbox, copy_sequence) == 4 * DOLLY_DISPLAY_WORD_COPY_SEQUENCE &&
    offsetof(dolly_display_mailbox, copy_length) == 4 * DOLLY_DISPLAY_WORD_COPY_LENGTH &&
    offsetof(dolly_display_mailbox, copy_flags) == 4 * DOLLY_DISPLAY_WORD_COPY_FLAGS &&
    offsetof(dolly_display_mailbox, cursor_col) == 4 * DOLLY_DISPLAY_WORD_CURSOR_COL &&
    offsetof(dolly_display_mailbox, cursor_row) == 4 * DOLLY_DISPLAY_WORD_CURSOR_ROW &&
    offsetof(dolly_display_mailbox, cell_width) == 4 * DOLLY_DISPLAY_WORD_CELL_WIDTH &&
    offsetof(dolly_display_mailbox, cell_height) == 4 * DOLLY_DISPLAY_WORD_CELL_HEIGHT &&
    offsetof(dolly_display_mailbox, padding_x) == 4 * DOLLY_DISPLAY_WORD_PADDING_X &&
    offsetof(dolly_display_mailbox, padding_y) == 4 * DOLLY_DISPLAY_WORD_PADDING_Y &&
    offsetof(dolly_display_mailbox, cursor_style) == 4 * DOLLY_DISPLAY_WORD_CURSOR_STYLE &&
    offsetof(dolly_display_mailbox, animation_frame_sequence) == 4 * DOLLY_DISPLAY_WORD_ANIMATION_FRAME_SEQUENCE &&
    offsetof(dolly_display_mailbox, surface_sequence) == 4 * DOLLY_DISPLAY_WORD_SURFACE_SEQUENCE &&
    offsetof(dolly_display_mailbox, surface_width) == 4 * DOLLY_DISPLAY_WORD_SURFACE_WIDTH &&
    offsetof(dolly_display_mailbox, surface_height) == 4 * DOLLY_DISPLAY_WORD_SURFACE_HEIGHT &&
    offsetof(dolly_display_mailbox, surface_scale_milli) == 4 * DOLLY_DISPLAY_WORD_SURFACE_SCALE_MILLI &&
    offsetof(dolly_display_mailbox, palette_sequence) == 4 * DOLLY_DISPLAY_WORD_PALETTE_SEQUENCE &&
    offsetof(dolly_display_mailbox, palette_background) == 4 * DOLLY_DISPLAY_WORD_PALETTE_BACKGROUND &&
    offsetof(dolly_display_mailbox, palette_foreground) == 4 * DOLLY_DISPLAY_WORD_PALETTE_FOREGROUND &&
    offsetof(dolly_display_mailbox, palette_cursor) == 4 * DOLLY_DISPLAY_WORD_PALETTE_CURSOR &&
    offsetof(dolly_display_mailbox, palette_colors) == 4 * DOLLY_DISPLAY_WORD_PALETTE_COLORS,
    "display mailbox words differ from dolly-display-0.wat");

_Alignas(64) static dolly_display_mailbox display_mailbox;
static const dolly_display_driver_v6 *driver;
static unsigned char *display_module_bytes;
static uintptr_t display_module_length;
static unsigned char *display_frames[DOLLY_DISPLAY_FRAME_COUNT];
_Alignas(64) static unsigned char
    display_copy_buffer[DOLLY_DISPLAY_COPY_CAPACITY];
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
  uint32_t cursor;
} dolly_display_lease;

// The leases held, the page's frames the last one's: a descendant of the
// holder takes the page over it, as a program it runs to show its own window,
// and the holder's lease is shown again when the descendant's ends. A covered
// holder keeps its size and cursor and paces on animation frames; it presents
// nothing (EAGAIN).
#define DISPLAY_LEASE_DEPTH 4
static dolly_display_lease display_leases[DISPLAY_LEASE_DEPTH];
static unsigned display_depth;
static uint64_t next_display_generation = 1;

static dolly_display_lease *shown_display_lease(void) {
  return display_depth ? &display_leases[display_depth - 1] : NULL;
}

// The surface and palette sequences the driver was last given, and the
// terminal grid its programs were last told of.
static uint32_t applied_surface, applied_palette;
static uint32_t notified_cols, notified_rows;

// The caller's lease of this generation, shown or covered, or NULL and why.
static dolly_display_lease *held_display_lease(int owner_pid, uint64_t generation, int *status) {
  for (unsigned i = 0; generation != 0 && i < display_depth; ++i) {
    if (display_leases[i].generation != generation) continue;
    if (owner_pid > 0 && owner_pid == display_leases[i].owner_pid) return &display_leases[i];
    *status = -EPERM;
    return NULL;
  }
  *status = -ESTALE;
  return NULL;
}

static void release_display_lease_for_pid(int owner_pid) {
  unsigned i = 0;
  while (i < display_depth && display_leases[i].owner_pid != owner_pid) ++i;
  if (i == display_depth) return;
  memmove(&display_leases[i], &display_leases[i + 1],
          (display_depth - i - 1) * sizeof(display_leases[0]));
  memset(&display_leases[--display_depth], 0, sizeof(display_leases[0]));
  const dolly_display_lease *shown = shown_display_lease();
  if (shown != NULL) {
    atomic_store_explicit(&display_mailbox.cursor_style, shown->cursor,
                          memory_order_release);
    return;
  }
  if (driver != NULL) driver->set_suspended(0);
  atomic_store_explicit(&display_mailbox.cursor_style,
                        DOLLY_DISPLAY_CURSOR_TEXT, memory_order_release);
  atomic_fetch_and_explicit(&display_mailbox.flags,
                            ~((uint32_t)DOLLY_DISPLAY_GRAPHICS_ACTIVE),
                            memory_order_release);
}

uintptr_t dolly_display_mailbox_address(void) {
  return (uintptr_t)&display_mailbox;
}

uintptr_t dolly_display_framebuffer_address(uint32_t index) {
  return index < DOLLY_DISPLAY_FRAME_COUNT
      ? (uintptr_t)display_frames[index] : 0;
}

uintptr_t dolly_display_copy_buffer_address(void) {
  return (uintptr_t)display_copy_buffer;
}

// Feeds the driver the surface the page last published. The sequence is odd
// while the page writes; such a surface is applied on a later tick.
static void apply_surface(void) {
  const uint32_t sequence = atomic_load_explicit(&display_mailbox.surface_sequence, memory_order_acquire);
  if (sequence == applied_surface || (sequence & 1u) != 0) return;
  const uint32_t width = atomic_load_explicit(&display_mailbox.surface_width, memory_order_relaxed);
  const uint32_t height = atomic_load_explicit(&display_mailbox.surface_height, memory_order_relaxed);
  const uint32_t scale = atomic_load_explicit(&display_mailbox.surface_scale_milli, memory_order_relaxed);
  if (sequence != atomic_load_explicit(&display_mailbox.surface_sequence, memory_order_acquire)) return;
  applied_surface = sequence;
  (void)driver->resize(width, height, scale);
}

// Gives the driver the colours the page last published, as apply_surface
// does the surface.
static void apply_palette(void) {
  const uint32_t sequence = atomic_load_explicit(&display_mailbox.palette_sequence, memory_order_acquire);
  if (sequence == applied_palette || (sequence & 1u) != 0) return;
  dolly_display_palette palette = {
      .background = atomic_load_explicit(&display_mailbox.palette_background, memory_order_relaxed),
      .foreground = atomic_load_explicit(&display_mailbox.palette_foreground, memory_order_relaxed),
      .cursor = atomic_load_explicit(&display_mailbox.palette_cursor, memory_order_relaxed),
  };
  for (size_t index = 0; index < 16; ++index) {
    palette.colors[index] = atomic_load_explicit(&display_mailbox.palette_colors[index], memory_order_relaxed);
  }
  if (sequence != atomic_load_explicit(&display_mailbox.palette_sequence, memory_order_acquire)) return;
  applied_palette = sequence;
  driver->set_palette(&palette);
}

// Tells the terminal's programs of a grid a new surface or font size made.
static uint32_t terminal_columns(void);
static uint32_t terminal_rows(void);

static void notify_grid(void) {
  const uint32_t cols = terminal_columns(), rows = terminal_rows();
  if (cols == notified_cols && rows == notified_rows) return;
  notified_cols = cols;
  notified_rows = rows;
  dolly_kernel_terminal_resized(cols, rows);
}

static int process_may_acquire_display(int pid) {
  const int foreground = dolly_kernel_foreground();
  return pid > 0 && foreground > 0 &&
      dolly_process_descends_from(pid, foreground);
}

static uint32_t terminal_columns(void) {
  return atomic_load_explicit(&display_mailbox.terminal_cols,
                              memory_order_acquire);
}

static uint32_t terminal_rows(void) {
  return atomic_load_explicit(&display_mailbox.terminal_rows,
                              memory_order_acquire);
}

static int terminal_attached(void) {
  return driver != NULL;
}

static void terminal_render(const unsigned char *bytes, size_t length) {
  driver->write(bytes, length);
}

static size_t terminal_replies(unsigned char *output, size_t capacity) {
  return driver != NULL ? driver->read(output, capacity) : 0;
}

/*
 * Terminal parsing and rasterization deliberately have different costs. A
 * write updates the driver's in-Wasm terminal state immediately, while this
 * bounded tick publishes at most one dirty framebuffer. A driver a graphics
 * lease suspended keeps its layout current and publishes nothing.
 */
int dolly_terminal_present_pending(void) {
  if (driver == NULL) return 0;
  apply_surface();
  apply_palette();
  const dolly_terminal_input *input = dolly_kernel_terminal_input_device();
  const int status = input != NULL ? input->service() : 0;
  driver->present();
  notify_grid();
  return status;
}

int dolly_display_prepare(void) {
  const char *driver_path = getenv("DOLLY_DISPLAY_LIBRARY");
  if (driver_path == NULL || driver_path[0] != '/') {
    fputs("dolly: DOLLY_DISPLAY_LIBRARY must name an absolute shared-library path\n", stderr);
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

int dolly_display_install(const dolly_display_driver_v6 *candidate) {
  if (driver != NULL || candidate == NULL || candidate->abi_version != 6 ||
      candidate->struct_size < sizeof(*candidate) ||
      candidate->initialize == NULL || candidate->write == NULL ||
      candidate->read == NULL || candidate->resize == NULL ||
      candidate->present == NULL || candidate->set_suspended == NULL ||
      candidate->set_palette == NULL) {
    fputs("dolly: incompatible sandbox display driver\n", stderr);
    return 1;
  }
  if (atomic_load_explicit(&display_mailbox.palette_sequence, memory_order_acquire) == 0) {
    fputs("dolly: the page gave the display no colours\n", stderr);
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
                            display_copy_buffer,
                            DOLLY_DISPLAY_COPY_CAPACITY) != 0) {
    fputs("dolly: sandbox display initialization failed\n", stderr);
    return 1;
  }
  atomic_store_explicit(&display_mailbox.cursor_style,
                        DOLLY_DISPLAY_CURSOR_TEXT, memory_order_release);
  puts("dolly: sandbox display ready");
  fflush(stdout);
  driver = candidate;
  apply_palette();
  notify_grid();
  return 0;
}

// Every surface response describes the caller's lease.
static int64_t respond_surface(unsigned char *mailbox, const dolly_display_lease *lease,
                               uint64_t capacity, uint32_t buffer_index) {
  const dolly_display_surface_response response = {
      .generation = lease->generation,
      .capacity = capacity,
      .buffer_index = buffer_index,
      .width = lease->width,
      .height = lease->height,
      .stride = lease->stride,
      .pixel_format = DOLLY_DISPLAY_PIXEL_RGBA8,
  };
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t display_acquire_packet(int pid, unsigned char *mailbox,
                                      uintptr_t request_size,
                                      uintptr_t response_capacity) {
  if (request_size != 0 ||
      response_capacity < sizeof(dolly_display_surface_response)) {
    return -EINVAL;
  }
  if (driver == NULL || display_frames[0] == NULL ||
      display_frames[1] == NULL) {
    return -ENODEV;
  }
  const dolly_display_lease *holder = shown_display_lease();
  if (holder == NULL ? !process_may_acquire_display(pid)
                     : pid == holder->owner_pid || !dolly_process_descends_from(pid, holder->owner_pid)) {
    return holder == NULL ? -EPERM : -EBUSY;
  }
  if (display_depth == DISPLAY_LEASE_DEPTH) return -EBUSY;

  // The lease starts at the size of the frame on screen: the terminal's, drawn
  // for the surface the page shows now, or the lease's it nests in.
  apply_surface();
  driver->present();
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
  driver->set_suspended(1);
  dolly_display_lease *lease = &display_leases[display_depth++];
  memset(lease, 0, sizeof(*lease));
  lease->generation = generation;
  lease->owner_pid = pid;
  lease->width = width;
  lease->height = height;
  lease->stride = stride;
  lease->cursor = DOLLY_DISPLAY_CURSOR_DEFAULT;
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
  return respond_surface(mailbox, lease, 0, 0);
}

static int64_t display_set_size_packet(int pid, unsigned char *mailbox,
                                       uintptr_t request_size,
                                       uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_display_size_request) ||
      response_capacity < sizeof(dolly_display_surface_response)) {
    return -EINVAL;
  }
  dolly_display_size_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.width == 0 || request.height == 0 ||
      request.width > DOLLY_DISPLAY_MAX_WIDTH ||
      request.height > DOLLY_DISPLAY_MAX_HEIGHT ||
      (uint64_t)request.width * request.height * 4u > display_frame_capacity) {
    return -EINVAL;
  }
  int status;
  dolly_display_lease *lease = held_display_lease(pid, request.generation, &status);
  if (lease == NULL) return status;
  lease->width = request.width;
  lease->height = request.height;
  lease->stride = request.width * 4u;
  return respond_surface(mailbox, lease, 0, 0);
}

static int64_t display_begin_frame_packet(int pid, unsigned char *mailbox,
                                          uintptr_t request_size,
                                          uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_display_generation_request) ||
      response_capacity < sizeof(dolly_display_surface_response)) {
    return -EINVAL;
  }
  dolly_display_generation_request request;
  memcpy(&request, mailbox, sizeof(request));
  int status;
  dolly_display_lease *lease = held_display_lease(pid, request.generation, &status);
  if (lease == NULL) return status;
  if (lease != shown_display_lease()) return -EAGAIN;
  const uint64_t length = (uint64_t)lease->stride * lease->height;
  if (lease->width == 0 || lease->height == 0 ||
      lease->stride != lease->width * 4u ||
      length > display_frame_capacity) {
    return -EIO;
  }
  const uint32_t active = atomic_load_explicit(&display_mailbox.frame_index,
                                                memory_order_acquire) & 1u;
  lease->staging_buffer = active ^ 1u;
  lease->staging_offset = 0;
  lease->staging = 1;
  return respond_surface(mailbox, lease, length, lease->staging_buffer);
}

static int64_t display_write_frame_packet(int pid, unsigned char *mailbox,
                                          uintptr_t request_size,
                                          uintptr_t response_capacity) {
  if (request_size < sizeof(dolly_display_write_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_display_write_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.reserved != 0 || request.size > SIZE_MAX ||
      request.offset > SIZE_MAX ||
      request.size != request_size - sizeof(request)) return -EINVAL;
  int status;
  dolly_display_lease *lease = held_display_lease(pid, request.generation, &status);
  if (lease == NULL) return status;
  if (lease != shown_display_lease()) return -EAGAIN;
  const size_t capacity = (size_t)lease->stride * lease->height;
  const size_t offset = (size_t)request.offset, size = (size_t)request.size;
  if (!lease->staging ||
      request.buffer_index != lease->staging_buffer ||
      offset != lease->staging_offset || offset > capacity ||
      size > capacity - offset) {
    return -EINVAL;
  }
  memcpy(display_frames[request.buffer_index] + offset,
         mailbox + sizeof(request), size);
  lease->staging_offset += size;
  return 0;
}

static int64_t display_present_packet(int pid, unsigned char *mailbox,
                                      uintptr_t request_size,
                                      uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_display_present_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_display_present_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.reserved != 0) return -EINVAL;
  int status;
  dolly_display_lease *lease = held_display_lease(pid, request.generation, &status);
  if (lease == NULL) return status;
  if (lease != shown_display_lease()) return -EAGAIN;
  const uint32_t active = atomic_load_explicit(&display_mailbox.frame_index,
                                                memory_order_acquire) & 1u;
  const uint32_t buffer_index = request.buffer_index;
  if (buffer_index >= DOLLY_DISPLAY_FRAME_COUNT ||
      buffer_index != (active ^ 1u) || !lease->staging ||
      buffer_index != lease->staging_buffer) {
    return -EINVAL;
  }
  const uint32_t width = lease->width;
  const uint32_t height = lease->height;
  const uint32_t stride = lease->stride;
  if (width == 0 || height == 0 || stride != width * 4u ||
      (uint64_t)stride * height > display_frame_capacity) {
    return -EIO;
  }
  if (lease->staging_offset != (size_t)stride * height) return -ENODATA;
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
  lease->staging = 0;
  lease->staging_offset = 0;
  return 0;
}

static int64_t display_wait_frame_packet(int pid, unsigned char *mailbox,
                                         uintptr_t request_size,
                                         uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_display_wait_request) ||
      response_capacity < sizeof(dolly_display_wait_response)) {
    return -EINVAL;
  }
  dolly_display_wait_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.reserved != 0) return -EINVAL;
  int status;
  if (held_display_lease(pid, request.generation, &status) == NULL) return status;
  const uint32_t sequence = atomic_load_explicit(
      &display_mailbox.animation_frame_sequence, memory_order_acquire);
  const int changed = sequence != request.sequence;
  if (!changed && dolly_kernel_deadline_pending(request.deadline_nanoseconds)) {
    return DOLLY_PROCESS_DISPATCH_DEFERRED;
  }
  const dolly_display_wait_response response = {changed, sequence};
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t display_set_cursor_packet(int pid, unsigned char *mailbox,
                                         uintptr_t request_size,
                                         uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_display_cursor_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_display_cursor_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.reserved != 0) return -EINVAL;
  int status;
  dolly_display_lease *lease = held_display_lease(pid, request.generation, &status);
  if (lease == NULL) return status;
  if (request.cursor > DOLLY_DISPLAY_CURSOR_HELP) return -EINVAL;
  lease->cursor = request.cursor;
  if (lease == shown_display_lease()) {
    atomic_store_explicit(&display_mailbox.cursor_style, request.cursor,
                          memory_order_release);
  }
  return 0;
}

static int64_t display_release_packet(int pid, unsigned char *mailbox,
                                      uintptr_t request_size,
                                      uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_display_generation_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_display_generation_request request;
  memcpy(&request, mailbox, sizeof(request));
  int status;
  if (held_display_lease(pid, request.generation, &status) == NULL) return status;
  release_display_lease_for_pid(pid);
  return 0;
}

static int64_t display_call(int pid, int tid, uint32_t operation, unsigned char *mailbox,
                            uintptr_t request_size, uintptr_t response_capacity) {
  switch (operation) {
    case DOLLY_DISPLAY_ACQUIRE:
      return display_acquire_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_DISPLAY_SET_SIZE:
      return display_set_size_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_DISPLAY_BEGIN_FRAME:
      return display_begin_frame_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_DISPLAY_WRITE_FRAME:
      return display_write_frame_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_DISPLAY_PRESENT:
      return display_present_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_DISPLAY_WAIT_FRAME:
      return display_wait_frame_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_DISPLAY_SET_CURSOR:
      return display_set_cursor_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_DISPLAY_RELEASE:
      return display_release_packet(pid, mailbox, request_size, response_capacity);
  }
  return -EINVAL;
}

static void display_release(int pid, int tid) {
  if (tid == 0) release_display_lease_for_pid(pid);
}

/* The terminal's output half (kernel/process-kernel.h). */
static const dolly_terminal_output terminal_output = {terminal_attached, terminal_render, terminal_replies};

const dolly_kernel_module dolly_display_kernel = {
    .first_operation = DOLLY_DISPLAY_ACQUIRE, .last_operation = DOLLY_DISPLAY_RELEASE,
    .call = display_call, .release = display_release, .terminal_output = &terminal_output};
