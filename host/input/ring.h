#pragma once
#include <dolly/input.h>

/* The input mailbox's record ring: the page is its one producer and the
 * kernel its one consumer, for the lessee or for the terminal, whose decoder
 * is NULL until a display library installs one. Kernel-private; programs see
 * input.h. */
typedef struct {
  dolly_input_mailbox *mailbox;
  const dolly_input_decoder *decoder;
} dolly_input_ring;

/* Removes the oldest record; returns whether there was one. */
int dolly_input_ring_take(const dolly_input_ring *ring, dolly_input_event *event);

/* Consumes the terminal's own records ahead of unread input (pointer and
 * scroll reach the decoder; motion, capture, presence and loss marks are
 * dropped) and keeps the rest in order. It never consumes what a program
 * reads. Returns zero or a negative errno. */
int dolly_input_ring_service(const dolly_input_ring *ring);

/* Ends pending input when the foreground program or the lessee changes: what
 * it had not read was meant for it and is dropped. With terminal_ui the
 * terminal's own pointer and scroll records still reach the decoder:
 * selecting and scrolling were never a program's input. */
void dolly_input_ring_discard(const dolly_input_ring *ring, int terminal_ui);
