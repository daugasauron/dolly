#ifndef DOLLY_DISPLAY_H
#define DOLLY_DISPLAY_H

#include <stddef.h>
#include <stdatomic.h>
#include <stdint.h>
#include <dolly/display-abi.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
  // Four consecutive, non-premultiplied bytes per pixel. Alpha must be 255
  // for an opaque pixel. Rows are top-to-bottom and pixels are left-to-right.
  DOLLY_DISPLAY_PIXEL_RGBA8 = 1,
} dolly_display_pixel_format;

typedef enum {
  DOLLY_DISPLAY_CURSOR_TEXT = 0,
  DOLLY_DISPLAY_CURSOR_DEFAULT = 1,
  DOLLY_DISPLAY_CURSOR_CROSSHAIR = 2,
  DOLLY_DISPLAY_CURSOR_POINTER = 3,
  DOLLY_DISPLAY_CURSOR_HIDDEN = 4,
  // What a window system shows over an edge, a corner, something being moved,
  // work in progress, a refusal and help.
  DOLLY_DISPLAY_CURSOR_NS_RESIZE = 5,
  DOLLY_DISPLAY_CURSOR_EW_RESIZE = 6,
  DOLLY_DISPLAY_CURSOR_NWSE_RESIZE = 7,
  DOLLY_DISPLAY_CURSOR_NESW_RESIZE = 8,
  DOLLY_DISPLAY_CURSOR_MOVE = 9,
  DOLLY_DISPLAY_CURSOR_WAIT = 10,
  DOLLY_DISPLAY_CURSOR_PROGRESS = 11,
  DOLLY_DISPLAY_CURSOR_NOT_ALLOWED = 12,
  DOLLY_DISPLAY_CURSOR_HELP = 13,
} dolly_display_cursor;

enum {
  DOLLY_DISPLAY_COPY_AVAILABLE = 1u << 0,
  DOLLY_DISPLAY_COPY_TRUNCATED = 1u << 1,
};

enum {
  // A foreground command has exclusively leased the framebuffer. This bit is
  // observable by the browser presenter, but ownership and policy remain
  // entirely inside Dolly.
  DOLLY_DISPLAY_GRAPHICS_ACTIVE = 1u << 0,
};

// Every field is a little-endian atomic u32. Frame pixels live in two
// separately allocated, fixed-address buffers returned by the runtime
// exports; frame_index selects the complete buffer.
typedef struct {
  _Atomic uint32_t flags;
  _Atomic uint32_t frame_sequence;
  _Atomic uint32_t frame_index;
  _Atomic uint32_t frame_width;
  _Atomic uint32_t frame_height;
  _Atomic uint32_t frame_stride;
  _Atomic uint32_t terminal_cols;
  _Atomic uint32_t terminal_rows;
  _Atomic uint32_t font_size_milli;
  // Dolly writes selection text, then publishes length, flags, and sequence.
  // The browser snapshots it around copy_sequence to avoid torn reads.
  _Atomic uint32_t copy_sequence;
  _Atomic uint32_t copy_length;
  _Atomic uint32_t copy_flags;
  _Atomic uint32_t cursor_col;
  _Atomic uint32_t cursor_row;
  _Atomic uint32_t cell_width;
  _Atomic uint32_t cell_height;
  _Atomic uint32_t padding_x;
  _Atomic uint32_t padding_y;
  // A closed semantic enum written by Dolly and mapped to CSS by the trusted
  // presenter. Commands never supply a browser string or DOM handle.
  _Atomic uint32_t cursor_style;
  // The browser increments this once per animation frame while a graphics
  // lease is active. Dolly owns waiting and interruption semantics.
  _Atomic uint32_t animation_frame_sequence;
  // The browser writes the surface it shows frames on (CSS pixels and the
  // device scale in thousandths) between two steps of the sequence, which is
  // odd while they change.
  _Atomic uint32_t surface_sequence;
  _Atomic uint32_t surface_width;
  _Atomic uint32_t surface_height;
  _Atomic uint32_t surface_scale_milli;
} dolly_display_mailbox;

#ifdef __cplusplus
static_assert(sizeof(dolly_display_mailbox) == DOLLY_DISPLAY_MAILBOX_SIZE,
              "display mailbox layout changed");
#else
_Static_assert(sizeof(dolly_display_mailbox) == DOLLY_DISPLAY_MAILBOX_SIZE,
               "display mailbox layout changed");
#endif

// Commands never receive the browser-facing mailbox. Instead, a foreground
// command may temporarily lease the same two runtime-owned frame buffers that
// the resident terminal renderer uses. A generation is an unforgeable-in-
// practice ownership token, not a security boundary: all commands already
// share one Wasm address space.
typedef struct {
  uint64_t generation;
  uint32_t width;
  uint32_t height;
  uint32_t stride;
  uint32_t pixel_format;
} dolly_display_surface;

// begin_frame returns only the buffer that is not currently visible. The
// command writes at most capacity bytes and presents buffer_index. A later
// begin_frame may return the other buffer after the browser has consumed the
// published frame.
typedef struct {
  unsigned char *pixels;
  size_t capacity;
  uint32_t buffer_index;
  uint32_t width;
  uint32_t height;
  uint32_t stride;
  uint32_t pixel_format;
} dolly_display_frame;

// Only the active foreground command may hold a lease. Operations return zero
// on success or a negative errno value.
int dolly_display_acquire(dolly_display_surface *surface);
// Select logical framebuffer dimensions for this lease. The browser scales
// the complete RGBA frame to the canvas; no browser object or capability is
// exposed. The terminal's current dimensions are restored on release.
int dolly_display_set_size(uint64_t generation, uint32_t width,
                           uint32_t height, dolly_display_surface *surface);
int dolly_display_begin_frame(uint64_t generation, dolly_display_frame *frame);
int dolly_display_present(uint64_t generation, uint32_t buffer_index);
// sequence is both the last observed animation frame and the newly observed
// value. Returns one for a new frame, zero on timeout, or a negative errno. A
// negative timeout waits indefinitely.
int dolly_display_wait_frame(uint64_t generation, uint32_t *sequence,
                             double timeout_milliseconds);
int dolly_display_set_cursor(uint64_t generation, uint32_t cursor);
int dolly_display_release(uint64_t generation);

// Process packets of the DOLLY_DISPLAY_* operations. A process never receives
// a pointer into the kernel framebuffer. BEGIN_FRAME describes the inactive
// buffer, WRITE_FRAME copies bounded sequential chunks into it, and PRESENT
// atomically publishes it after the complete frame has arrived. This keeps
// both memories private while allowing frames larger than
// DOLLY_PROCESS_PACKET_LIMIT.
typedef struct {
  uint64_t generation;
  uint32_t width;
  uint32_t height;
} dolly_display_size_request;

typedef struct {
  uint64_t generation;
} dolly_display_generation_request;

typedef struct {
  uint64_t generation;
  uint64_t capacity;
  uint32_t buffer_index;
  uint32_t width;
  uint32_t height;
  uint32_t stride;
  uint32_t pixel_format;
  uint32_t reserved;
} dolly_display_surface_response;

// `size` pixel bytes follow this header. `offset` must be the next unwritten
// byte of the frame begun for buffer_index.
typedef struct {
  uint64_t generation;
  uint64_t offset;
  uint64_t size;
  uint32_t buffer_index;
  uint32_t reserved;
} dolly_display_write_request;

typedef struct {
  uint64_t generation;
  uint32_t buffer_index;
  uint32_t reserved;
} dolly_display_present_request;

typedef struct {
  uint64_t generation;
  uint64_t deadline_nanoseconds;
  uint32_t sequence;
  uint32_t reserved;
} dolly_display_wait_request;

typedef struct {
  int32_t result;
  uint32_t sequence;
} dolly_display_wait_response;

typedef struct {
  uint64_t generation;
  uint32_t cursor;
  uint32_t reserved;
} dolly_display_cursor_request;

#ifdef __cplusplus
#define DOLLY_DISPLAY_LAYOUT(type, size) static_assert(sizeof(type) == size, #type)
#else
#define DOLLY_DISPLAY_LAYOUT(type, size) _Static_assert(sizeof(type) == size, #type)
#endif
DOLLY_DISPLAY_LAYOUT(dolly_display_size_request, 16);
DOLLY_DISPLAY_LAYOUT(dolly_display_generation_request, 8);
DOLLY_DISPLAY_LAYOUT(dolly_display_surface_response, 40);
DOLLY_DISPLAY_LAYOUT(dolly_display_write_request, 32);
DOLLY_DISPLAY_LAYOUT(dolly_display_present_request, 16);
DOLLY_DISPLAY_LAYOUT(dolly_display_wait_request, 24);
DOLLY_DISPLAY_LAYOUT(dolly_display_wait_response, 8);
DOLLY_DISPLAY_LAYOUT(dolly_display_cursor_request, 16);
#undef DOLLY_DISPLAY_LAYOUT

// A display driver is a resident shared library, not an executable. DISPLAY
// names the selected library. It is loaded once and remains in the shared Wasm
// address space for the lifetime of the runtime; it finds its own font.
typedef struct {
  uint32_t abi_version;
  uint32_t struct_size;
  int (*initialize)(dolly_display_mailbox *mailbox,
                    unsigned char *frame_a,
                    unsigned char *frame_b,
                    size_t frame_capacity,
                    unsigned char *copy_buffer,
                    size_t copy_capacity);
  // Terminal output. What the terminal answers its program (a cursor report)
  // waits for read, which copies at most capacity bytes and returns their count.
  void (*write)(const unsigned char *bytes, size_t length);
  size_t (*read)(unsigned char *output, size_t capacity);
  // The surface the page shows: CSS pixels and the device scale in thousandths.
  int (*resize)(uint32_t width, uint32_t height, uint32_t scale_milli);
  // Publishes at most one dirty frame.
  void (*present)(void);
  // Pausing preserves terminal parser/grid state while suppressing frame
  // publication. Resuming immediately publishes a complete terminal frame.
  void (*set_suspended)(int suspended);
} dolly_display_driver_v5;

typedef const dolly_display_driver_v5 *(*dolly_display_driver_getter_v5)(void);

#ifdef __cplusplus
}
#endif

#endif
