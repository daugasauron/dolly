# buttons@0 is reworked: a generic module for a touchscreen's input, which programs compile against

- STATUS: OPEN
- PRIORITY: 310
- TAGS: host-modules,input,phone,owner

Owner (2026-10-13): "create a task to rework the "buttons module"
completely. What I wanted from that is something generic to capture
touchscreen input from smartphones that programs can compile against, the
module hsould be very generic. Specific programs can then compile against
that. The current state of the pi-phone image is decent but I don't like the
module contract."

His first request, 2026-10-06
([touch-input](../20261005-222057-touch-input/TASK.md), closed into the phone
image without being built): "a smartphone-input module so it's easy to write
programs for phones (respond to touch, drag etc), and a simple image with
some demo to prove/test that it works nicely."

Done when: a program reads what fingers do on the screen (each touch with
its identity, position and phase, so that a tap, a drag and two fingers are
the program's to tell apart) through a module that knows nothing of buttons,
captions, keyboards or Pi; `voice` in `pi-phone` draws its own buttons and
reads its own taps through it and does what it does today; `buttons@0` is
gone; the module's contract, its row in the review map and the sentence of
`AGENTS.md` say what it is; tested in Chromium with touch emulation and on a
phone.

## As filed (2026-10-13, main `11d2bd0a`)

What `buttons@0` is (`host/buttons/dolly-buttons-0.wat`): the program sends
a caption and up to twelve labelled buttons, the page draws them as a strip
below the terminal and reports presses; one kind of button is the page's own
Paste, which hands over the clipboard's text; a second operation types bytes
into the terminal. One process holds it.

Why that is not the module he asked for:

- It is policy in the host. The page decides that input on a phone is a row
  of labelled buttons with a caption; a program that wants a slider, a
  drawing surface, a swipe or its own layout cannot have it. A module should
  carry the mechanism, what the fingers did, and leave the meaning to the
  program.
- It is three things under one name: a widget toolkit, the clipboard, and
  typing into the terminal.
- It is written around one program: its own comment says "A program that
  holds the buttons stands in for a keyboard".

What exists to build on, to read before designing: `input@0` already
carries records for keys, text, focus, paste, the pointer, scrolling,
relative motion and pointer capture to a program that holds the input lease
(`host/input/dolly-input-0.wat`). Whether touches are more records of that
module or a module of their own is the first question; the owner's word is
"very generic", and one module for what comes from the user's hands may be
the smaller answer.

Questions the design answers, each the owner's to confirm:

- Where a program that draws its own controls draws them: the terminal's
  cells, a frame through the display, or a region of the page the module
  gives it. `pi-phone` needs Pi's terminal and `voice`'s controls on one
  screen.
- The clipboard. Today it reaches a program only by the user's press on the
  page's own Paste button, which is a rule of the boundary; it stays a rule
  whatever module carries it, and it is not touch input.
- Typing into the terminal for another program (`voice` types what was said
  into Pi): today an operation of `buttons@0`; it is not touch input either.
  A pseudo-terminal (`pty@0`) may be the Unix answer: `voice` runs Pi on a
  slave and writes to its master.
- What the on-screen keyboard does while a program holds the touches.

It changes a contract and the boundary's review map, and a module's client
is in the seed: design first, in this task, before code.
