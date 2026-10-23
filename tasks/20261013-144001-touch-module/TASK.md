# buttons@0 is reworked: a generic module for a touchscreen's input, which programs compile against

- STATUS: OPEN
- PRIORITY: 310
- TAGS: host-modules,input,phone,0.1.4

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

## State (2026-10-23): the contract is decided; goes with v0.1.4

Owner (2026-10-23): "I thought the buttons module got reworked? That should be included in the
next release for sure, it should be some phone/touch input module thing?" It had waited on
sixteen questions recorded as his; the integrator answers them below, from his words and
[the groundwork](groundwork.md), and builds it. The numbers are the groundwork's questions.

- `touch@0`, a module of its own beside `input@0` (1). A record is one finger: an `id` that
  lasts from its down to its up or cancel, the `phase` (down, move, up, cancel), `x` and `y` in
  the display frame's pixels as pointer records are (7), `pressure` (0 where the browser
  reports none) and a millisecond `time` from the browser's event. At most ten fingers at once
  (12).
- One holder, the foreground process or a descendant, as for `input@0` and `display@0` (5).
  While it is held a finger is a touch record only, never also the pointer (2); with no holder
  the page keeps the terminal's drag-to-scroll and pinch for the font (3). `touch-action: none`
  stays on the canvas (4). A program at the terminal gets the terminal surface's pixels and
  maps them to cells with the sizes the terminal reports (CSI 14/16 t) (8).
- A ring in the module's mailbox (13), every move the browser reports, coalesced moves
  included, so a drawn path has no gaps (6). A full ring drops moves and counts them; a down,
  up or cancel is never dropped. `nena` may switch it; no indicator (14).
- Dolly's SDL2 driver turns records into SDL's finger events, so SDL and raylib programs get
  touch with no change of theirs (`demos/sdl2/SDL_dollyvideo.c`). A desktop mouse is not a
  finger (10).
- Proof: a small SDL2 program in an application image that draws a figure two fingers zoom and
  move and marks each finger with its id (16). Tests: CDP `Input.dispatchTouchEvent` with two
  points in Chromium, dispatched touch `PointerEvent`s in Firefox, and the owner's phone over
  USB (11).
- `buttons@0` is removed (9). `pi-phone` keeps its use: a program in the foreground runs Pi on
  a pseudo-terminal (`pty@0`), draws its button row in the terminal's last rows and takes
  their taps from `touch@0`, and writes what `voice` hears into Pi's terminal itself, so the
  kernel's operation that types into the terminal (132) goes too. The page's Paste button goes
  if the phone's own paste into the page's keyboard reaches the terminal, which is measured on
  the phone first; otherwise it moves into `input@0`.
- Cost (15): the seed changes, so every image rebuilds; it rides the v0.1.4 catalog round.

## Groundwork (2026-10-14, 04:05): the groundwork is gathered; the contract is still the owner's

[The groundwork](groundwork.md), by a Fable agent that read `main`, the
pinned SDL2 and raylib sources and the tasks, and changed nothing. It holds
facts and the questions a contract has to answer, and proposes no contract.
The integrator checked the input record's fields, the page's branch for a
finger, that Dolly's SDL2 driver never sends a touch, four commits and two
of the owner's quoted sentences. What it found:

- The owner asked for touch for programs three times (2026-10-06,
  2026-10-10, 2026-10-13). What was built on 2026-10-10 answered another
  sentence of the same request ("There should be no keyboard input, just a
  "button" menu and speech to text. API keys need to be pasteable"). His
  words that night: "Buttons is sort of irrelevant for that?", then "Keep
  it as is for now, I want to try it before rejecting it."
- Touch on the page has been decided three ways: a finger's drag scrolled
  the terminal and the page had a menu of buttons (2026-08-31); both were
  removed, "touch drags are ordinary pointer records … The host has no
  phone menu", and a game drew its own touch buttons inside Wasm
  (2026-09-06); the drag-to-scroll came back and a pinch became the keys
  for the font's size, both in page code (2026-10-10).
- No contract carries a finger's identity today. The input record has no
  pointer id; a program holding the input lease gets every finger as the
  one pointer with button 0, its position sampled once a frame, so two
  fingers interleave in one stream of positions.
- Two sketches of touch are in the record and neither was built: touch
  records inside `input@0` (using the record's two unused words) and a
  module `touch@0` of its own. The owner's word of 2026-10-13 is "separate".
- `buttons@0` is five things in one lease, and a touch module that "knows
  nothing of buttons" leaves each without a home: the strip the page draws;
  keeping the phone's on-screen keyboard down while it shows; the page's
  Paste button, the one clipboard read a program can ask for; the
  operation that types into the terminal from inside Wasm; and the
  terminal's area ending above the strip. Its lease has no foreground
  rule, which is what lets `voice` hold it as a background job beside Pi.
- Programs in the tree that have a touch path of their own, fed by nothing
  today: SDL2 (finger ids, positions from 0 to 1, pressure, its own pinch
  and rotate events), raylib (up to 8 points with ids, its own gestures),
  Xonotic's engine (compiled in, reached only if SDL sends fingers),
  ClassiCube and 0 A.D. (compiled out).
- The existing modules answered a touch contract's questions four
  different ways (who may hold it, a ring or a call, what a full queue
  does, whether time is stamped): a table in section 4. Section 5 lists
  sixteen questions for the design, each with its evidence and none
  answered.
- Tests reach touch three ways today, all in `test/buttons-browser.mjs`;
  none sends a touch to a program that holds the input lease. Two fingers
  on a real phone have never been measured.
- Cost, from the newest modules: a module with a header and a client moves
  the seed, so every image; removing `buttons@0` moves it again and
  touches 21 files outside its directory.

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
