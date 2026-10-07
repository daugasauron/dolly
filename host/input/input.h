#ifndef DOLLY_INPUT_H
#define DOLLY_INPUT_H

#include <stddef.h>
#include <stdatomic.h>
#include <stdint.h>
#include <dolly/input-abi.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
  DOLLY_INPUT_EVENT_KEY = 1,
  DOLLY_INPUT_EVENT_TEXT = 2,
  DOLLY_INPUT_EVENT_FOCUS = 4,
  DOLLY_INPUT_EVENT_PASTE = 5,
  DOLLY_INPUT_EVENT_POINTER = 6,
  DOLLY_INPUT_EVENT_SCROLL = 7,
  DOLLY_INPUT_EVENT_POINTER_MOTION = 8,
  DOLLY_INPUT_EVENT_POINTER_CAPTURE = 9,
  DOLLY_INPUT_EVENT_POINTER_PRESENCE = 10,
  // Records were lost here: the ring was full. Let go of held keys and buttons.
  DOLLY_INPUT_EVENT_DROPPED = 11,
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

// The unit of a scroll record's delta, as a browser WheelEvent reports it.
typedef enum {
  DOLLY_SCROLL_UNIT_PIXEL = 0,
  DOLLY_SCROLL_UNIT_LINE = 1,
  DOLLY_SCROLL_UNIT_PAGE = 2,
} dolly_scroll_unit;

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
  // A foreground command holds the input lease and reads every record.
  DOLLY_INPUT_LEASED = 1u << 0,
  // It asks for relative pointer motion. The page may capture the pointer
  // only after a user's press on the canvas; Escape releases the capture.
  DOLLY_INPUT_POINTER_RELATIVE = 1u << 1,
};

// One record of every type; a type uses the fields listed and leaves the rest
// zero. data holds key, code and text back to back as UTF-8 without
// terminators.
//   KEY      action (dolly_key_action), modifiers, flags COMPOSING; key and
//            code as in a browser KeyboardEvent
//   TEXT     text: typed, composed or pasted, split on character boundaries
//   FOCUS    action 1 while the window has focus, 0 after it lost it
//   PASTE    the terminal's paste buffer holds one paste
//   POINTER  action (dolly_pointer_action), modifiers, button 0 to 4 in
//            flags >> 8, x and y in canvas pixels
//   SCROLL   action (dolly_scroll_unit), y: delta in thousandths of that
//            unit, positive toward later content
//   POINTER_MOTION    x and y: relative motion in thousandths of a CSS pixel,
//                     each within +-32,768,000
//   POINTER_CAPTURE   action 1 while the pointer is captured, 0 after
//   POINTER_PRESENCE  action 1 while the pointer is over the canvas, 0 after
//   DROPPED  action: records lost since the page loaded
typedef struct {
  uint32_t type;
  uint32_t action;
  uint32_t modifiers;
  uint32_t flags;
  int32_t x;
  int32_t y;
  uint32_t reserved[2];
  uint16_t key_length;
  uint16_t code_length;
  uint16_t text_length;
  uint16_t reserved_length;
  unsigned char data[DOLLY_INPUT_EVENT_DATA_SIZE];
} dolly_input_event;

// All fields before events are little-endian atomic u32 values.
typedef struct {
  _Atomic uint32_t event_read;
  _Atomic uint32_t event_write;
  _Atomic uint32_t flags;
  _Atomic uint32_t paste_sequence;
  _Atomic uint32_t paste_consumed_sequence;
  _Atomic uint32_t paste_length;
  _Atomic uint32_t enabled;
  dolly_input_event events[DOLLY_INPUT_EVENT_CAPACITY];
} dolly_input_mailbox;

#ifdef __cplusplus
#define DOLLY_INPUT_LAYOUT(condition, name) static_assert(condition, name)
#else
#define DOLLY_INPUT_LAYOUT(condition, name) _Static_assert(condition, name)
#endif
DOLLY_INPUT_LAYOUT(sizeof(dolly_input_event) == DOLLY_INPUT_EVENT_SIZE, "input record layout changed");
DOLLY_INPUT_LAYOUT(offsetof(dolly_input_mailbox, events) == DOLLY_INPUT_HEADER_SIZE,
                   "input mailbox layout changed");

// Only the foreground command or a descendant may hold the lease, one at a
// time. While it does, it reads every record and the terminal reads none.
// Operations return zero on success or a negative errno value (acquire:
// ENOSYS where no page listens for input); next_event returns one with a
// record, zero on timeout. A negative timeout waits indefinitely. Exit
// releases the lease; unread records are dropped.
int dolly_input_acquire(uint64_t *generation);
int dolly_input_next_event(uint64_t generation, dolly_input_event *event,
                           double timeout_milliseconds);
// Asks for relative pointer motion (POINTER_MOTION records) or ends it.
// POINTER_CAPTURE reports when the page captures the pointer and when the
// capture is lost.
int dolly_input_set_pointer_relative(uint64_t generation, int relative);
int dolly_input_release(uint64_t generation);

// Process packets of the DOLLY_INPUT_* operations. ACQUIRE has an empty
// request and RELEASE an empty response.
typedef struct {
  uint64_t generation;
} dolly_input_generation;

typedef struct {
  uint64_t generation;
  uint64_t deadline_nanoseconds;
} dolly_input_event_request;

typedef struct {
  int32_t result;
  uint32_t reserved;
  dolly_input_event event;
} dolly_input_event_response;

typedef struct {
  uint64_t generation;
  uint32_t relative;
  uint32_t reserved;
} dolly_input_pointer_request;

DOLLY_INPUT_LAYOUT(sizeof(dolly_input_generation) == 8, "dolly_input_generation");
DOLLY_INPUT_LAYOUT(sizeof(dolly_input_event_request) == 16, "dolly_input_event_request");
DOLLY_INPUT_LAYOUT(sizeof(dolly_input_event_response) == 136, "dolly_input_event_response");
DOLLY_INPUT_LAYOUT(sizeof(dolly_input_pointer_request) == 16, "dolly_input_pointer_request");
#undef DOLLY_INPUT_LAYOUT

// How a resident terminal turns input into the bytes its programs read. The
// display library that draws a terminal installs one; without it the
// terminal reads no key. Both write at most capacity bytes and their count,
// and return zero or a negative value.
typedef struct {
  // A key, text, pointer or scroll record. Pointer and scroll are the
  // terminal's own (selection, scrollback) and yield no bytes.
  int (*record)(const dolly_input_event *event, unsigned char *output,
                size_t capacity, size_t *length);
  // One user paste.
  int (*paste)(const unsigned char *bytes, size_t size, unsigned char *output,
               size_t capacity, size_t *length);
} dolly_input_decoder;

// For a kernel plugin (abi/dolly-kernel-plugin-0.wat), not for programs.
int dolly_input_decoder_install(const dolly_input_decoder *decoder);

#ifdef __cplusplus
}
#endif

#endif
