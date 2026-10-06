#include "input-ring.h"

#include <errno.h>
#include <stdatomic.h>

_Static_assert((DOLLY_DISPLAY_EVENT_CAPACITY & (DOLLY_DISPLAY_EVENT_CAPACITY - 1)) == 0,
               "display event capacity must be a power of two");

static dolly_input_event *slot(const dolly_input_ring *ring, uint32_t index) {
  return &ring->mailbox->events[index & (DOLLY_DISPLAY_EVENT_CAPACITY - 1)];
}

int dolly_input_ring_handle(const dolly_input_ring *ring, const dolly_input_event *event,
                            unsigned char *output, size_t capacity, size_t *length) {
  const uint32_t columns = atomic_load(&ring->mailbox->terminal_cols);
  const uint32_t rows = atomic_load(&ring->mailbox->terminal_rows);
  const int result = ring->driver->handle_event(event, output, capacity, length);
  if (result == 0 && event != NULL && event->type == DOLLY_INPUT_EVENT_RESIZE &&
      (columns != atomic_load(&ring->mailbox->terminal_cols) ||
       rows != atomic_load(&ring->mailbox->terminal_rows)))
    ring->resized();
  return result;
}

/*
 * Terminal parsing and rasterization deliberately have different costs. A
 * write updates the driver's in-Wasm terminal state immediately, while this
 * bounded service publishes at most one dirty framebuffer per supervisor tick.
 * Passing zero output capacity is important: handle_event(NULL, ...) may
 * expose a terminal-query response, and a service call must neither consume
 * nor discard those input bytes.
 */
int dolly_input_ring_service(const dolly_input_ring *ring) {
  unsigned char preserved;
  size_t output_length = 0;
  const uint32_t read = atomic_load_explicit(&ring->mailbox->event_read, memory_order_relaxed);
  const uint32_t write = atomic_load_explicit(&ring->mailbox->event_write, memory_order_acquire);
  if (write - read > DOLLY_DISPLAY_EVENT_CAPACITY) return -EPROTO;
  // UI intent is independent of stdin. Zero marks a consumed UI slot.
  for (uint32_t cursor = read; cursor != write; ++cursor) {
    dolly_input_event *event = slot(ring, cursor);
    if (event->type == DOLLY_INPUT_EVENT_POINTER_MOTION ||
        event->type == DOLLY_INPUT_EVENT_POINTER_CAPTURE ||
        event->type == DOLLY_INPUT_EVENT_POINTER_PRESENCE) {
      event->type = 0;
      continue;
    }
    if (event->type == DOLLY_INPUT_EVENT_RESIZE ||
        event->type == DOLLY_INPUT_EVENT_POINTER ||
        event->type == DOLLY_INPUT_EVENT_SCROLL) {
      (void)dolly_input_ring_handle(ring, event, &preserved, 0, &output_length);
      event->type = 0;
    }
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
  return dolly_input_ring_handle(ring, NULL, &preserved, 0, &output_length);
}

void dolly_input_ring_discard(const dolly_input_ring *ring, int terminal_ui) {
  unsigned char preserved;
  size_t output_length = 0;
  uint32_t read = atomic_load_explicit(&ring->mailbox->event_read, memory_order_relaxed);
  const uint32_t write = atomic_load_explicit(&ring->mailbox->event_write, memory_order_acquire);
  while (read != write) {
    const dolly_input_event event = *slot(ring, read++);
    atomic_store_explicit(&ring->mailbox->event_read, read, memory_order_release);
    if (ring->driver != NULL && (event.type == DOLLY_INPUT_EVENT_RESIZE ||
        (terminal_ui && (event.type == DOLLY_INPUT_EVENT_POINTER ||
                         event.type == DOLLY_INPUT_EVENT_SCROLL))))
      (void)dolly_input_ring_handle(ring, &event, &preserved, 0, &output_length);
  }
}
