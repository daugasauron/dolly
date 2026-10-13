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

And when the first version of this task mixed other things in: "Your
interpretation seems off again. Do not include keyboard in this. The main
thing is like, if you touch with 2 fingers at the same time and do a zoom
for example, the program should be able to regognize that, this is quite
different from just moving a mouse pointer which is why I think it has to be
separate."

Done when: a module of its own, separate from `input@0`, gives a program
what fingers do on a touchscreen: every touch that is down at the same time,
each with an identity that lasts from its start to its end, its position and
its phase, so that the program itself can tell a tap from a drag and
recognise two fingers moving apart as a zoom; the module knows nothing of
buttons, captions or any program; a small program proves it (two fingers
zoom something it draws), in Chromium with touch emulation and on a phone;
`buttons@0` is replaced by it.

## As filed (2026-10-13, main `11d2bd0a`)

- What `buttons@0` is (`host/buttons/dolly-buttons-0.wat`): the program
  sends a caption and up to twelve labelled buttons, the page draws them as
  a strip below the terminal and reports which was pressed. The page decides
  what input on a phone looks like; a program gets presses of buttons, never
  fingers. That is the contract the owner does not like.
- Why it is a module of its own and not more of the pointer: a pointer is
  one position that moves; a touchscreen is several contacts at once, each
  beginning, moving and ending by itself, and a gesture is a relation
  between them. `input@0` carries one pointer
  (`host/input/dolly-input-0.wat`, records 6 to 10).
- Not part of this module: keys, an on-screen keyboard, typing, the
  clipboard.
- The contract is the owner's: design it here first (the record of a touch,
  how a program asks for touches and gives them up, what the page does with
  a touch nobody reads, limits), then code. A module's client is in the
  seed.
