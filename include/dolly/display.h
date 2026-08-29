#ifndef DOLLY_DISPLAY_H
#define DOLLY_DISPLAY_H

#include <stddef.h>
#include <stdatomic.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
  DOLLY_DISPLAY_MAILBOX_VERSION = 1,
  DOLLY_DISPLAY_MAILBOX_HEADER_SIZE = 128,
  DOLLY_DISPLAY_EVENT_SIZE = 128,
  DOLLY_DISPLAY_EVENT_CAPACITY = 256,
  DOLLY_DISPLAY_EVENT_DATA_SIZE = 88,
  DOLLY_DISPLAY_MAX_WIDTH = 4096,
  DOLLY_DISPLAY_MAX_HEIGHT = 2304,
  DOLLY_DISPLAY_FRAME_COUNT = 2,
};

typedef enum {
  DOLLY_INPUT_EVENT_KEY = 1,
  DOLLY_INPUT_EVENT_TEXT = 2,
  DOLLY_INPUT_EVENT_RESIZE = 3,
  DOLLY_INPUT_EVENT_FOCUS = 4,
} dolly_input_event_type;

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
  unsigned char reserved[DOLLY_DISPLAY_MAILBOX_HEADER_SIZE - 16 * sizeof(uint32_t)];
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
                    const char *font_path);
  void (*write)(const unsigned char *bytes, size_t length);
  int (*handle_event)(const dolly_input_event *event,
                      unsigned char *output,
                      size_t output_capacity,
                      size_t *output_length);
} dolly_display_driver_v1;

typedef const dolly_display_driver_v1 *(*dolly_display_driver_getter_v1)(void);

#ifdef __cplusplus
}
#endif

#endif
