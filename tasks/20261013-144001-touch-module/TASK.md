# buttons@0 is reworked: a generic module for a touchscreen's input, which programs compile against

- STATUS: OPEN
- PRIORITY: 60
- TAGS: host-modules,input,phone

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

## State (2026-11-03): waits for the owner: the phone, and buttons in touch@0

In v0.1.4 (released 2026-10-31): `touch@0` (`host/touch/`), the SDL2 and raylib drivers, the
`fingers` demo, `buttons@0` removed; `test/touch-ring.test.mjs`, `test/touch-browser.mjs` and
`demos/fingers/test/fingers-browser.mjs` pass in Chromium and Firefox. The images "not rebuilt
here" on 2026-10-23 (below) are in that release's catalog. The `0.1.4` tag is gone: what is left
is no release's work. Ranked 60 from 310, as it waits for the owner.

Left:

- **Buttons in `touch@0`.** 835fa963b (2026-11-03, a contract change the owner approved that
  day, `tasks/20261010-193000-phone-voice-pi`) gives the lease holder BUTTONS (op 95): up to 12
  labels the page shows in input@0's bar below the canvas, before Paste and drawn as Paste is; a
  tap is a `PRESS` record (id the button's index, x the labels word), and the buttons go with the
  lease. pi-phone's Speak, Send, Clear and Menu are such buttons. This contradicts the done-when
  below ("the module knows nothing of buttons, captions or any program") and resembles
  `buttons@0`: keep them in `touch@0` as approved, or give them a module of their own. A line of
  `tasks/20261102-133353-owner-decisions`.
- **The phone.** pi-phone ran on the owner's phone on 2026-11-03 over USB. Not tried there:
  `fingers` with two real fingers, and the phone keyboard's own paste at the `default` prompt
  (if it reaches the terminal, Paste could leave input@0). Both at the owner's call
  (2026-10-24: "phone stuff - wait for my calls later").

## The contract (2026-10-23): decided; went with v0.1.4

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

## Built (2026-10-23, `core/touch-module`)

Step 1, the module (`host/touch/`), decided and measured:

- A mailbox and no import, as `input@0`: `abi/dolly-browser-0.wat` is unchanged (it lists
  imports only); the review point is the `touch@0` row of `docs/browser-boundary.md`.
  Process operations 92 ACQUIRE, 93 READ, 94 RELEASE, beside input's 88-91.
- Record, 32 bytes: `id, phase, x, y, pressure, dropped, time, lease`. The page numbers
  fingers itself from 1, never giving one id to two fingers, rather than passing the
  browser's `pointerId`. `pressure` is the browser's in thousandths: the Pointer Events
  spec makes a browser without a sensor report 0.5 for a finger that is down, so "0 where
  the browser reports none" is 500 there; Chromium's CDP touches report 1000. `time` is
  `event.timeStamp` in milliseconds, wrapping (only differences mean anything). `lease`
  is the lease word the page read when it wrote the record: READ returns only the
  holder's, so a record written as one lease ends cannot reach the next holder.
- READ returns up to 64 records a call, not one as input's NEXT_EVENT does: a phone
  reports moves of every finger at the digitizer's rate.
- Ring of 512. Moves are written while more than 20 records are free; a down only while
  the ring keeps room for it and the end of every finger down; an end always fits. So a
  delivered finger's up or cancel is never dropped; a finger whose down finds no room (a
  holder that has not read through 240 taps) or an eleventh finger is not delivered at
  all. Everything not written is counted in the next record's `dropped`.
- While held, the page's capture listener on `window` takes every finger that goes down
  on the canvas and stops it before `input@0`'s canvas listeners; a finger already down
  when the hold began stays input's until it lifts, and a finger of an earlier lease is
  nobody's until it lifts. The page neither focuses nor blurs the keyboard for a finger
  under the hold, and a long press opens no context menu.
- Packaged (`Dollyfile-libdolly-touch`, `scripts/build.sh` `packaged_modules`) as no core
  source includes it. Measured: adding the module leaves the seed alone, `npm run
  build:runtime` prints the same image inputs `sha256:a24f5a0f…` as before; no image is
  stale by it. The integration tree's images are therefore reused here (hard links).
- The foreground rule is input's: the foreground program or a descendant. Found while
  testing: the shell runs commands without `DOLLY_PROCESS_SPAWN_FOREGROUND`, so a
  background job of the shell at its prompt passes it, for input as for touch; only a
  program started with `foreground` makes its siblings fail with EPERM.
- Tests: `test/touch-ring.test.mjs` (the page's ring rules), `test/touch-browser.mjs`
  (refusals; two fingers by CDP `Input.dispatchTouchEvent` in Chromium and by dispatched
  touch `PointerEvent`s in Firefox, each with its own id, in frame pixels, every move;
  no finger is the pointer for a program holding both leases while a mouse click is;
  without a holder a finger scrolls the terminal). Passed in Chromium (8.3 s) and
  Firefox (9.6 s).

Step 2, SDL2 (`demos/sdl2/SDL_dollyvideo.c`): the driver takes the touch lease beside display
and input when the page has one (and goes on without it otherwise), adds one touch device of
`SDL_TOUCH_DEVICE_DIRECT` and turns each record into `SDL_SendTouch` or `SDL_SendTouchMotion`
with the position as a fraction of the window and the pressure as 0..1. SDL's own code then
makes the first finger its mouse (`SYNTHESIZE_TOUCH_TO_MOUSE` is 1 in `SDL_touch.c`,
`SDL_HINT_TOUCH_MOUSE_EVENTS` on by default), so mouse-only SDL programs keep working with a
finger now that no finger is the pointer, and SDL's gestures come from its own code.
Consequence, decided: every SDL2 program records `touch@0`, so `sdl2` declares it and installs
`libdolly-touch`, and every recipe that installs `sdl2` or retains a program linked with it
declares `touch@0` (the lint named the INSTALL ones; xorg-server, x11-desktop, ghostty-x11,
xonotic, zero-ad, zero-ad-engine and imgui-x11 by reading which retain one; zero-ad-engine
installs and imgui-x11 uses `libdolly-touch` to link). Not rebuilt here: bhop, classicube,
classicube-build, imgui, imgui-x11, rts-build, rts-arena, xorg-server-build, xorg-server,
x11-desktop, ghostty-x11, xonotic-build, xonotic, zero-ad-deps, zero-ad-engine, zero-ad. The
sdl2 demo test passes on the rebuilt `sdl2` (Chromium).

Step 3, `demos/fingers/`: `fingers.c` is a plain SDL2 program of SDL's finger events. It draws at
the terminal's size in pixels (CSI 14 t, which the terminal answers), a checked square that one
finger moves and the first two fingers zoom about their midpoint, which it follows; each finger
is a disc in its id's colour with the id drawn above it. Images: `fingers-build` (the program,
SDL2 linked in) and the application `fingers` (core, posix, display, fingers-build).
`demos/fingers/test/fingers-browser.mjs` reads the canvas: two fingers 120 px apart moved to 240
double the figure about their midpoint, each marked with its colour and digit, one finger moves
it 100 by 50, and the program's own report after Escape says so. Passed in Chromium (CDP
touches) and Firefox (touch PointerEvents), twice each. Found on the way: Chromium delivers a
CDP touch move with its next frame and may end a touch without its last move, so a program must
take an up's position as the finger's last; `fingers.c` does.

Step 4, `buttons@0` removed and `pi-phone` ported:

- Gone: `host/buttons/`, `Dollyfile-libdolly-buttons`, its import in `abi/dolly-browser-0.wat`,
  its row, edge and handle member in `docs/browser-boundary.md`, its section in `docs/input.md`,
  its constraint paragraph in `AGENTS.md`, the strip's CSS in `terminal.html`, its tests, and
  operation 132 with the kernel's typed queue (`host/input/kernel.c`, the foreground interrupt
  of `src/dolly.c`, both declarations in `src/process-kernel.h`; the input ring test is as before
  `7a6daada`). Measured: `npm run build:runtime` still prints image inputs
  `sha256:a24f5a0f…`; the seed does not change by the removal either.
- `voice MENU [MODEL] -- PROGRAM` is the foreground program: it opens a pseudo-terminal, gives
  PROGRAM (Pi) all rows but its own (the size set on the master, so Pi gets SIGWINCH), forwards
  Pi's output to the terminal and the keyboard's input to Pi, and keeps Pi above its rows with a
  scroll region. Its rows (a caption and the buttons, three terminal rows a row of buttons, about
  48 CSS px on a phone) are drawn after Pi's output wherever the output can be cut: outside an
  escape sequence, a UTF-8 character and a synchronized update (DEC 2026, which Pi's TUI uses);
  the draw saves and restores the cursor (Pi's TUI uses no DECSC of its own: `packages/tui/src`
  has none). A tap is a finger's down and up on one button; voice holds `touch@0`. The speech
  model loads on a thread while Pi starts.
- Mapping a finger to a cell: the terminal answers CSI 16 t (cell size in frame pixels), asked
  before Pi starts and again after a resize. Its padding (12 by 10 CSS px times the device scale,
  `src/ghostty/display.c`) is reported by no sequence (Ghostty's size reports are the text area
  only), so a cell found by division is the finger's or one right of or below it; voice keeps a
  column between buttons and gives it to the left one. Recorded as a gap in `docs/input.md`.
- The page's Paste button: no phone was connected (`adb devices` empty, 13:5x), so the phone's own
  paste into the page's keyboard was not measured, and Paste moved into `input@0` as the contract
  says: on a touchscreen (`(pointer: coarse)`) the page shows a Paste button at the top right; it
  reads the clipboard only inside the user's press and delivers it as an ordinary paste, to the
  terminal or a lessee. pi.menu's Paste key became Enter, after the page's Paste.
- Lost, by design: while voice has the fingers a drag over Pi's rows scrolls nothing (the page's
  drag-to-scroll and pinch are input@0's only without a holder).
- Measured, Chromium: `demos/speech/test/speech-browser.mjs` passes all four parts; in `pi-phone`
  on the Pixel 7 emulation Pi has the rows above voice's eight, the key goes in
  by the page's Paste and Enter, a model is chosen by a spoken word, the thinking level by taps, a
  spoken prompt is sent and answered, and the microphone is closed after. Typing a button's text
  must be one write: written a byte at a time, Pi's autocompletion took Enter before the filter
  ("/login openrouter" became "/login openrouteramazon-bedrock").
  `test/touch-browser.mjs` (with the Pixel 7 part: 48 columns at 412 and 360 wide, CDP finger
  drag, the Paste button granted and refused) passes in Chromium and Firefox; `fingers` and `sdl2`
  pass again; source 434/0. `nena enable touch`, `disable`, `enable` in `default` work in both
  browsers (checked by hand, not a committed test).
- Not attributed: an early voice called a null function pointer in `lay_out` and hung, with no
  "process failed" line and no shell prompt after it; a small `-pthread` program making the same
  call ends with status 126 as it should. Not reproduced beyond voice. Measured again on
  2026-10-28 (`1da64c86`'s images, Chromium): a main thread's null call ends the process with
  "failed: null function" and 126 within 0.21 s while another thread computes, waits on a
  condition or sleeps, also with a child on a pseudo-terminal from `openpty`, as voice runs Pi.

Also run after step 4, in Chromium and Firefox: `imgui` (rebuilt on the new `sdl2`; it seals with touch@0), `sockets`, `boundary`, `host-modules`, `nena`,
`terminal`, `indicators` and `default` (its last part needs `zig` in this tree's narrowed image
list, which was not built here). The core suite as a whole was not run (the integrator's).

Left on 2026-10-23, 14:40 (today's in the State above):

- The done-when's phone waits for the owner's call (2026-10-24: "phone stuff - wait for my
  calls later"); no agent connects a phone before then. On 2026-10-23 no phone was
  connected all day (`adb devices` empty at 13:5x and 14:33),
  so `fingers` and `pi-phone` were not opened on the owner's phone, and the phone's own paste into
  the page's keyboard was not measured. With a phone: open `/fingers/` and `/pi-phone/`, try two
  fingers and the button rows, and try the keyboard's own paste (Gboard's clipboard chip) at the
  `default` prompt; if it reaches the terminal, the Paste button can go from `input@0`.
- Not rebuilt here, their recipes changed (touch@0, pins): bhop, classicube-build, classicube,
  imgui-x11, rts-build, rts-arena, xorg-server-build, xorg-server, x11-desktop,
  ghostty-x11, xonotic-build, xonotic, zero-ad-deps, zero-ad-engine, zero-ad, and the docs chain
  dolly-docs, pi-agent, pi-local, dollyfile-studio. Their sealing is the proof that the touch@0
  lines are where a retained executable needs them.
- raylib: done (2026-10-27). Its Dolly platform backend (`demos/slopyard/Dollyfile-raylib`)
  holds touch@0 beside input@0 where the page gives it, and keeps raylib's touch points as
  raylib's own touch platforms do: fingers in the order they came down, a gesture event each,
  the first also the mouse; a tap inside one frame reads as down for a frame. raylib declares
  touch@0, as `sdl2` does, and so do `gamedev-sdk` and `slopyard`. `test/amy-browser.mjs` puts
  two fingers on a raylib window in Chromium (CDP) and Firefox (touch PointerEvents).

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
