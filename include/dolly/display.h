#ifndef DOLLY_DISPLAY_H
#define DOLLY_DISPLAY_H

#include <stddef.h>
#include <stdatomic.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
  DOLLY_DISPLAY_MAILBOX_VERSION = 4,
  DOLLY_DISPLAY_MAILBOX_HEADER_SIZE = 128,
  DOLLY_DISPLAY_EVENT_SIZE = 128,
  DOLLY_DISPLAY_EVENT_CAPACITY = 256,
  DOLLY_DISPLAY_EVENT_DATA_SIZE = 88,
  DOLLY_DISPLAY_MAX_WIDTH = 4096,
  DOLLY_DISPLAY_MAX_HEIGHT = 2304,
  DOLLY_DISPLAY_FRAME_COUNT = 2,
  DOLLY_DISPLAY_CLIPBOARD_CAPACITY = 256 * 1024,
};

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
} dolly_display_cursor;

typedef enum {
  DOLLY_INPUT_EVENT_KEY = 1,
  DOLLY_INPUT_EVENT_TEXT = 2,
  DOLLY_INPUT_EVENT_RESIZE = 3,
  DOLLY_INPUT_EVENT_FOCUS = 4,
  DOLLY_INPUT_EVENT_PASTE = 5,
  DOLLY_INPUT_EVENT_POINTER = 6,
  // action is a signed, two's-complement delta in thousandths of a terminal
  // row. Negative scrolls toward older output and positive toward the active
  // screen. The browser forwards intent; the in-Wasm display driver owns the
  // viewport and all scrollback state.
  DOLLY_INPUT_EVENT_SCROLL = 7,
} dolly_input_event_type;

typedef enum {
  DOLLY_POINTER_ACTION_RELEASE = 0,
  DOLLY_POINTER_ACTION_PRESS = 1,
  DOLLY_POINTER_ACTION_DRAG = 2,
} dolly_pointer_action;

typedef enum {
  DOLLY_KEY_ACTION_RELEASE = 0,
  DOLLY_KEY_ACTION_PRESS = 1,
  DOLLY_KEY_ACTION_REPEAT = 2,
} dolly_key_action;

enum {
  DOLLY_INPUT_MOD_SHIFT = 1u << 0,
  DOLLY_INPUT_MOD_CONTROL = 1u << 1,
  DOLLY_INPUT_MOD_ALT = 1u << 2,
  DOLLY_INPUT_MOD_META = 1u << 3,
  DOLLY_INPUT_MOD_CAPS_LOCK = 1u << 4,
  DOLLY_INPUT_MOD_NUM_LOCK = 1u << 5,
};

enum {
  DOLLY_INPUT_FLAG_COMPOSING = 1u << 0,
};

enum {
  DOLLY_DISPLAY_COPY_AVAILABLE = 1u << 0,
  DOLLY_DISPLAY_COPY_TRUNCATED = 1u << 1,
};

enum {
  // Set while a nested foreground command, rather than the resident
  // interactive shell, owns the terminal. The browser uses this bit only to
  // distinguish terminal Ctrl-C input from a process-directed SIGINT.
  DOLLY_DISPLAY_FOREGROUND_INTERRUPTIBLE = 1u << 0,
  // A foreground command has exclusively leased the framebuffer. This bit is
  // observable by the browser presenter, but ownership and policy remain
  // entirely inside Dolly.
  DOLLY_DISPLAY_GRAPHICS_ACTIVE = 1u << 1,
};

// Browser input is deliberately semantic-but-unencoded. The browser copies
// KeyboardEvent strings and modifier state into this fixed record; Ghostty
// inside Dolly decides which bytes, if any, reach the foreground program.
typedef struct {
  uint32_t type;
  uint32_t action;
  uint32_t modifiers;
  uint32_t flags;
  uint32_t width_css_px;
  uint32_t height_css_px;
  uint32_t device_scale_milli;
  uint32_t font_size_milli;
  uint16_t key_length;
  uint16_t code_length;
  uint16_t text_length;
  uint16_t reserved;
  unsigned char data[DOLLY_DISPLAY_EVENT_DATA_SIZE];
} dolly_input_event;

#ifdef __cplusplus
static_assert(sizeof(dolly_input_event) == DOLLY_DISPLAY_EVENT_SIZE,
              "display event layout changed");
#else
_Static_assert(sizeof(dolly_input_event) == DOLLY_DISPLAY_EVENT_SIZE,
               "display event layout changed");
#endif

// All fields before events are little-endian atomic u32 values. The browser
// is the single event producer and Dolly is the single consumer. Frame pixels
// live in two separately allocated, fixed-address buffers returned by the
// runtime exports; frame_index selects the complete buffer.
typedef struct {
  _Atomic uint32_t event_read;
  _Atomic uint32_t event_write;
  _Atomic uint32_t event_wake;
  _Atomic uint32_t event_dropped;
  _Atomic uint32_t result_sequence;
  _Atomic uint32_t result_status;
  _Atomic uint32_t foreground_pid;
  _Atomic uint32_t flags;
  _Atomic uint32_t frame_sequence;
  _Atomic uint32_t frame_index;
  _Atomic uint32_t frame_width;
  _Atomic uint32_t frame_height;
  _Atomic uint32_t frame_stride;
  _Atomic uint32_t terminal_cols;
  _Atomic uint32_t terminal_rows;
  _Atomic uint32_t font_size_milli;
  // The browser writes paste bytes, then publishes length and sequence. Dolly
  // acknowledges the exact sequence only after the resident terminal driver
  // has consumed it. At most one paste can therefore be in flight.
  _Atomic uint32_t paste_sequence;
  _Atomic uint32_t paste_consumed_sequence;
  _Atomic uint32_t paste_length;
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
  // Ctrl-C is a process event, not ordinary stdin. The browser publishes the
  // target before incrementing the sequence. Dolly consumes it only when that
  // pid is still the active foreground command.
  _Atomic uint32_t interrupt_sequence;
  _Atomic uint32_t interrupt_target_pid;
  // The browser increments this once per animation frame while a graphics
  // lease is active. Dolly owns waiting and interruption semantics.
  _Atomic uint32_t animation_frame_sequence;
  // A closed semantic enum written by Dolly and mapped to CSS by the trusted
  // presenter. Commands never supply a browser string or DOM handle.
  _Atomic uint32_t cursor_style;
  dolly_input_event events[DOLLY_DISPLAY_EVENT_CAPACITY];
} dolly_display_mailbox;

#ifdef __cplusplus
static_assert(offsetof(dolly_display_mailbox, events) ==
                  DOLLY_DISPLAY_MAILBOX_HEADER_SIZE,
              "display mailbox layout changed");
#else
_Static_assert(offsetof(dolly_display_mailbox, events) ==
                   DOLLY_DISPLAY_MAILBOX_HEADER_SIZE,
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

// Only the active foreground command may hold a lease. All operations return
// zero on success except next_event, which returns one event, zero on timeout,
// or a negative errno value. A negative timeout waits indefinitely.
int dolly_display_acquire(dolly_display_surface *surface);
// Select logical framebuffer dimensions for this lease. The browser scales
// the complete RGBA frame to the canvas; no browser object or capability is
// exposed. The terminal's current dimensions are restored on release.
int dolly_display_set_size(uint64_t generation, uint32_t width,
                           uint32_t height, dolly_display_surface *surface);
int dolly_display_begin_frame(uint64_t generation, dolly_display_frame *frame);
int dolly_display_present(uint64_t generation, uint32_t buffer_index);
// sequence is both the last observed animation frame and the newly observed
// value. Returns one for a new frame, zero on timeout, or a negative errno.
int dolly_display_wait_frame(uint64_t generation, uint32_t *sequence,
                             double timeout_milliseconds);
int dolly_display_set_cursor(uint64_t generation, uint32_t cursor);
int dolly_display_next_event(uint64_t generation, dolly_input_event *event,
                             double timeout_milliseconds);
int dolly_display_release(uint64_t generation);

// A display driver is a resident filesystem side module, not an executable.
// It is compiled inside Dolly after libghostty-vt, loaded once, and remains in
// the shared Wasm address space for the lifetime of the runtime.
typedef struct {
  uint32_t abi_version;
  uint32_t struct_size;
  int (*initialize)(dolly_display_mailbox *mailbox,
                    unsigned char *frame_a,
                    unsigned char *frame_b,
                    size_t frame_capacity,
                    unsigned char *paste_buffer,
                    unsigned char *copy_buffer,
                    size_t clipboard_capacity,
                    const char *font_path);
  void (*write)(const unsigned char *bytes, size_t length);
  int (*handle_event)(const dolly_input_event *event,
                      unsigned char *output,
                      size_t output_capacity,
                      size_t *output_length);
  // Pausing preserves terminal parser/grid state while suppressing frame
  // publication. Resuming immediately publishes a complete terminal frame.
  void (*set_suspended)(int suspended);
} dolly_display_driver_v3;

typedef const dolly_display_driver_v3 *(*dolly_display_driver_getter_v3)(void);

#ifdef __cplusplus
}
#endif

#endif
