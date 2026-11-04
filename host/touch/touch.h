#ifndef DOLLY_TOUCH_H
#define DOLLY_TOUCH_H

#include <stddef.h>
#include <stdatomic.h>
#include <stdint.h>
#include <dolly/touch-abi.h>

#ifdef __cplusplus
extern "C" {
#endif

// One finger at one moment (dolly-touch-0.wat): phase is DOLLY_TOUCH_DOWN,
// MOVE, UP or CANCEL; id lasts from the finger's down to its up or cancel.
// x and y are pixels of the frame the canvas shows, pressure thousandths as
// the browser reports it (500 for a finger down where it has no sensor),
// time milliseconds of the browser's event clock. dropped counts the records
// the page had no room for since the record before this one. A record of
// phase DOLLY_TOUCH_PRESS is a press of the button whose index is id.
typedef struct {
  uint32_t id;
  uint32_t phase;
  int32_t x;
  int32_t y;
  uint32_t pressure;
  uint32_t dropped;
  uint32_t time;
  uint32_t lease;
} dolly_touch_record;

// All fields before records are little-endian atomic u32 values.
typedef struct {
  _Atomic uint32_t read;
  _Atomic uint32_t write;
  _Atomic uint32_t lease;
  _Atomic uint32_t enabled;
  dolly_touch_record records[DOLLY_TOUCH_CAPACITY];
  _Atomic uint32_t labels;
  uint32_t label_count;
  char label_text[DOLLY_TOUCH_BUTTON_COUNT][DOLLY_TOUCH_LABEL_SIZE];
} dolly_touch_mailbox;

#ifdef __cplusplus
#define DOLLY_TOUCH_LAYOUT(condition, name) static_assert(condition, name)
#else
#define DOLLY_TOUCH_LAYOUT(condition, name) _Static_assert(condition, name)
#endif
DOLLY_TOUCH_LAYOUT(sizeof(dolly_touch_record) == DOLLY_TOUCH_RECORD_SIZE, "touch record layout changed");
DOLLY_TOUCH_LAYOUT(offsetof(dolly_touch_mailbox, records) == DOLLY_TOUCH_HEADER_SIZE,
                   "touch mailbox layout changed");
DOLLY_TOUCH_LAYOUT(offsetof(dolly_touch_mailbox, labels) == DOLLY_TOUCH_BUTTONS_OFFSET &&
                       offsetof(dolly_touch_mailbox, label_count) == DOLLY_TOUCH_LABEL_COUNT_OFFSET &&
                       offsetof(dolly_touch_mailbox, label_text) == DOLLY_TOUCH_LABELS_OFFSET,
                   "touch buttons layout changed");

// Only the foreground command or a descendant may hold the lease, one at a
// time. While it does, every finger on the canvas is its record and none is
// the pointer. Operations return zero on success or a negative errno value:
// acquire is ENOSYS where no page listens, EPERM for another process and
// EBUSY while the lease is held. read returns the number of records, at most
// capacity, zero on timeout; it waits for the first one until the timeout
// ends, indefinitely for a negative one. Exit releases the lease; unread
// records are dropped. buttons shows count labels (at most
// DOLLY_TOUCH_BUTTON_COUNT, each shorter than DOLLY_TOUCH_LABEL_SIZE bytes and
// not empty) as the holder's buttons, in place of those it showed; zero
// clears them. A press of one is read as a record of phase DOLLY_TOUCH_PRESS
// whose id is its index.
int dolly_touch_acquire(uint64_t *generation);
int dolly_touch_read(uint64_t generation, dolly_touch_record *records, size_t capacity,
                     double timeout_milliseconds);
int dolly_touch_release(uint64_t generation);
int dolly_touch_buttons(uint64_t generation, const char *const *labels, size_t count);

// Process packets of the DOLLY_TOUCH_* operations. ACQUIRE has an empty
// request, RELEASE and BUTTONS an empty response.
typedef struct {
  uint64_t generation;
} dolly_touch_generation;

typedef struct {
  uint64_t generation;
  uint64_t deadline_nanoseconds;
  uint32_t capacity;
  uint32_t reserved;
} dolly_touch_read_request;

typedef struct {
  uint32_t count;
  uint32_t reserved;
  dolly_touch_record records[DOLLY_TOUCH_READ_RECORDS];
} dolly_touch_read_response;

typedef struct {
  uint64_t generation;
  uint32_t count;
  uint32_t reserved;
  char labels[DOLLY_TOUCH_BUTTON_COUNT][DOLLY_TOUCH_LABEL_SIZE];
} dolly_touch_buttons_request;

DOLLY_TOUCH_LAYOUT(sizeof(dolly_touch_generation) == 8, "dolly_touch_generation");
DOLLY_TOUCH_LAYOUT(sizeof(dolly_touch_read_request) == 24, "dolly_touch_read_request");
DOLLY_TOUCH_LAYOUT(offsetof(dolly_touch_read_response, records) == 8, "dolly_touch_read_response");
DOLLY_TOUCH_LAYOUT(offsetof(dolly_touch_buttons_request, labels) == 16, "dolly_touch_buttons_request");
#undef DOLLY_TOUCH_LAYOUT

#ifdef __cplusplus
}
#endif

#endif
