#include "ring.h"

#include <errno.h>
#include <stdatomic.h>

_Static_assert((DOLLY_INPUT_EVENT_CAPACITY & (DOLLY_INPUT_EVENT_CAPACITY - 1)) == 0,
               "input event capacity must be a power of two");

static dolly_input_event *slot(const dolly_input_ring *ring, uint32_t index) {
  return &ring->mailbox->events[index & (DOLLY_INPUT_EVENT_CAPACITY - 1)];
}

/* A pointer or scroll record yields no bytes. */
static void decode_terminal_ui(const dolly_input_ring *ring, const dolly_input_event *event) {
  unsigned char unused;
  size_t length;
  if (ring->decoder != NULL) (void)ring->decoder->record(event, &unused, 0, &length);
}

int dolly_input_ring_take(const dolly_input_ring *ring, dolly_input_event *event) {
  const uint32_t read = atomic_load_explicit(&ring->mailbox->event_read, memory_order_relaxed);
  if (read == atomic_load_explicit(&ring->mailbox->event_write, memory_order_acquire)) return 0;
  *event = *slot(ring, read);
  atomic_store_explicit(&ring->mailbox->event_read, read + 1, memory_order_release);
  return 1;
}

int dolly_input_ring_service(const dolly_input_ring *ring) {
  const uint32_t read = atomic_load_explicit(&ring->mailbox->event_read, memory_order_relaxed);
  const uint32_t write = atomic_load_explicit(&ring->mailbox->event_write, memory_order_acquire);
  if (write - read > DOLLY_INPUT_EVENT_CAPACITY) return -EPROTO;
  // UI intent is independent of stdin. Zero marks a consumed slot.
  for (uint32_t cursor = read; cursor != write; ++cursor) {
    dolly_input_event *event = slot(ring, cursor);
    if (event->type == DOLLY_INPUT_EVENT_POINTER || event->type == DOLLY_INPUT_EVENT_SCROLL) {
      decode_terminal_ui(ring, event);
    } else if (event->type != DOLLY_INPUT_EVENT_POINTER_MOTION &&
               event->type != DOLLY_INPUT_EVENT_POINTER_CAPTURE &&
               event->type != DOLLY_INPUT_EVENT_POINTER_PRESENCE &&
               event->type != DOLLY_INPUT_EVENT_DROPPED) {
      continue;
    }
    event->type = 0;
  }
  // Compact remaining input toward the published tail, in order, before
  // releasing slots. The producer cannot overwrite this range until read is
  // advanced. Thus UI traffic cannot fill the ring behind an unread key/paste.
  uint32_t retained = write;
  for (uint32_t cursor = write; cursor != read;) {
    const dolly_input_event event = *slot(ring, --cursor);
    if (event.type != 0) {
      --retained;
      if (retained != cursor) *slot(ring, retained) = event;
    }
  }
  atomic_store_explicit(&ring->mailbox->event_read, retained, memory_order_release);
  return 0;
}

void dolly_input_ring_discard(const dolly_input_ring *ring, int terminal_ui) {
  dolly_input_event event;
  while (dolly_input_ring_take(ring, &event)) {
    if (terminal_ui && (event.type == DOLLY_INPUT_EVENT_POINTER ||
                        event.type == DOLLY_INPUT_EVENT_SCROLL))
      decode_terminal_ui(ring, &event);
  }
}
