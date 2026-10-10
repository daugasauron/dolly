# Input

Keys, the pointer, the wheel, window focus, IME text and paste reach Wasm as
bounded records in one ring ([`host/input/dolly-input-0.wat`](../host/input/dolly-input-0.wat),
[`input.h`](../host/input/input.h), [`input.mjs`](../host/input/input.mjs)).
The page copies ordinary DOM event data; what a record means is decided in
Wasm. An image gets records only if it declares `REQUIRES HOST input@0`.

```mermaid
flowchart LR
  page["Page: keys, pointer, wheel, focus, text, paste"] -- "128-byte records" --> ring["Kernel input ring"]
  ring -- "no lease" --> decoder["Terminal decoder: bytes for stdin, selection, scrollback"]
  ring -- "input lease" --> app["Foreground process: dolly_input_next_event"]
```

## Who reads the ring

- Without a lease the terminal does. Keys, text and paste go through the
  decoder that the display library registered
  ([display](display.md#terminal)) and become the bytes the foreground program
  reads from its terminal. Pointer and scroll records are the terminal's own:
  selection and scrollback, handled ahead of unread keys on the display's tick.
  A finger's drag is sent as scroll records, so it scrolls where a mouse's
  drag selects.
  Two fingers moving apart or together are sent as the keys Ctrl+= and
  Ctrl+-, a font size for each 20 CSS px.
- `dolly_input_acquire` gives the foreground process or a descendant the
  lease, one at a time. It then reads every record with
  `dolly_input_next_event`, and the terminal reads none. The page sends it
  every button, pointer presence and a paste as text records.
- Release, exit or forced termination ends the lease; records the program had
  not read are dropped. So are the unread keys of a foreground program that
  ends without a lease, while the terminal keeps its pointer and scroll
  records.
- The display and input leases are independent
  ([graphics processes](display.md#graphics-processes)).
- Pointer lock: `dolly_input_set_pointer_relative` asks for relative motion.
  The page captures the pointer only on a user's press on the canvas while the
  lessee asks, and ends the capture on Escape, release or exit.

## The ring

- The ring in Wasm memory is the only queue of input; the page holds no
  record back. Pointer motion is a sample: relative deltas add up and the
  newest position wins. It is sent once per animation frame while half the ring
  is free, so it never takes a key's slot and a program that does not read
  delays it without losing it.
- Any other record needs a free slot. One that finds none is lost: the page
  counts it in `data-input-dropped` on `<html>`, says so in its status line
  and writes one `DROPPED` record into the slot it keeps for that, where the
  first lost record would have been. A program that reads it lets go of the
  keys and buttons it holds: a release may be among the lost.
- The page notifies the Worker of each record a reader waits on (all under a
  lease; keys, text, paste and focus for the terminal), so the reader resumes
  then, not at the next 16 ms tick.

## Buttons

`buttons@0` stands in for a keyboard on a touch screen. One program shows a
caption and up to 12 buttons in a strip of the page below the terminal, reads
their presses and types into the terminal
([`host/buttons/dolly-buttons-0.wat`](../host/buttons/dolly-buttons-0.wat),
[`buttons.h`](../host/buttons/buttons.h), [`buttons.mjs`](../host/buttons/buttons.mjs)).

- One process holds the buttons; a second OPEN fails with `EBUSY`. CLOSE,
  exit and forced termination remove the strip.
- SHOW replaces the caption (480 bytes) and the buttons (24-byte labels) and
  returns the layout's number, which changes with the buttons and not with
  the caption. READ never blocks: it returns one press, with the layout and
  the index it was made on. The page queues 16 and drops a press that finds
  the queue full.
- The page sets caption and labels as text and lays the buttons out itself.
  While the strip is shown the terminal's grid ends above it and a tap on the
  terminal raises no on-screen keyboard; a hardware keyboard still types.
- A button of kind PASTE is the page's own. It says "Paste", and the page
  reads the clipboard only inside the user's press of it: the text (4,096
  bytes) arrives with the press, a refusal as `EACCES`.
- Typing stays in Wasm. Process operation 132 appends up to 4,096 bytes to
  the terminal's input in the kernel, in order with the keyboard's records,
  and the foreground program reads them as keys. Byte 3 interrupts it while
  `ISIG` is set, as Ctrl+C does.
- C SDK: `<dolly/buttons.h>` and `libdolly-buttons.a`, which `cc` links by
  default; calling it stamps `buttons@0` into the executable.

## Images without one of the two

- `display@0` without `input@0`: the terminal shows output and reads no key,
  a program that links the input client is refused before it runs, and the
  lease itself is `ENOSYS` wherever no page listens, a build included.
- `input@0` without `display@0`: a program that takes the lease reads keys,
  text, focus and paste. There is no canvas, so no pointer records, and no
  decoder, so a terminal read returns nothing and unread records stay queued.
