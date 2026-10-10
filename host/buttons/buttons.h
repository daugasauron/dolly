#pragma once
#include <dolly/buttons-abi.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct {
  uint64_t scope, sequence;
  unsigned char packet[DOLLY_BUTTONS_PACKET_BYTES];
} dolly_buttons;
/* DOLLY_BUTTON_PRESS with a UTF-8 label, which ends at a NUL or fills the
   array; or DOLLY_BUTTON_PASTE, the page's own "Paste" button, which a program
   cannot name: its label is not sent. */
typedef struct {
  uint32_t kind;
  char label[DOLLY_BUTTONS_LABEL_BYTES];
} dolly_button;
/* A press of `button`, the index in the layout numbered `layout`. A PASTE
   carries what the clipboard held, `length` bytes of UTF-8 in `text` without a
   terminator, and status 0; or length 0 and the errno of why not: EACCES
   (refused, or the read failed) or E2BIG (more than DOLLY_BUTTONS_PASTE_BYTES). */
typedef struct {
  uint32_t layout, button, kind, status, length;
  char text[DOLLY_BUTTONS_PASTE_BYTES];
} dolly_buttons_event;
/* The buttons stand in for a keyboard on a touch screen: the page shows their
   holder's caption and buttons below the terminal, and the holder reads the
   presses and types into the terminal.
   Zero-initialize before first use; one process holds them at a time (open
   fails with EBUSY for another), called serially. Functions return -1 and set
   errno on failure. Exit closes. On sequence EOVERFLOW, close and reopen. */
int dolly_buttons_open(dolly_buttons *buttons);
int dolly_buttons_close(dolly_buttons *buttons);
/* Replaces what is shown by a caption (UTF-8, at most
   DOLLY_BUTTONS_CAPTION_BYTES; NULL for none) and `count` buttons (at most
   DOLLY_BUTTONS_MAX); with neither the strip is hidden. Returns the layout's
   number, positive: greater whenever the buttons change, the same while only
   the caption does. An event names the layout it was pressed on. */
int dolly_buttons_show(dolly_buttons *buttons, const char *caption, const dolly_button *list, uint32_t count);
/* Returns 1 and an event, or 0 when none is waiting; never blocks. The page
   queues DOLLY_BUTTONS_EVENTS of them and drops a press that finds the queue full. */
int dolly_buttons_read(dolly_buttons *buttons, dolly_buttons_event *event);
/* Terminal input, as if typed: whoever reads the terminal reads these bytes
   (at most DOLLY_BUTTONS_TYPE_BYTES a call), in order with the keyboard's
   input. EAGAIN while the queue is full. Byte 3 is Ctrl+C: it interrupts the
   foreground program while the terminal's ISIG is set, as the key does. */
int dolly_buttons_type(dolly_buttons *buttons, const char *bytes, uint32_t length);
#ifdef __cplusplus
}
#endif
