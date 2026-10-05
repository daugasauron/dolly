#pragma once
#include <dolly/display.h>
#include <stddef.h>

/* The display mailbox's input ring: the page is its one producer and the
 * kernel its one consumer; the resident driver decodes records into terminal
 * bytes and publishes frames. Kernel-private; programs see display.h. */
typedef struct {
  dolly_display_mailbox *mailbox;
  const dolly_display_driver_v4 *driver;
  void (*resized)(void); /* The terminal grid changed size. */
} dolly_input_ring;

/* The driver's handle_event, reporting a changed grid to resized(). */
int dolly_input_ring_handle(const dolly_input_ring *ring, const dolly_input_event *event,
                            unsigned char *output, size_t capacity, size_t *length);

/* Consumes the UI records ahead of unread input (resize, pointer and scroll
 * reach the driver; motion, capture and presence are dropped), keeps the rest
 * in order, then lets the driver publish at most one dirty frame. It never
 * consumes terminal input. Returns zero or a negative errno. */
int dolly_input_ring_service(const dolly_input_ring *ring);

/* Ends pending input when the foreground program or the display owner
 * changes: what it had not read was meant for it and is dropped. Resize still
 * reaches the driver. With terminal_ui, so do the terminal's own pointer and
 * scroll records: selecting and scrolling were never a program's input. */
void dolly_input_ring_discard(const dolly_input_ring *ring, int terminal_ui);
