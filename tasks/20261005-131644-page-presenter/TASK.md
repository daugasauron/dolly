# Page presenter allocates 14 MB per frame, never idles and drops input silently

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: core,display,performance,observability

Static reading of `host/display/display.mjs` at release `223b8f9e…` plus
in-sandbox measurements (`~/Downloads/AUDIT-browser-runtime.md` §1-§7, `~/Downloads/AUDIT-session-latency.md` §4): 75 fps with 28-42 ms gaps.

- `FramebufferPresenter.paint()` copies each frame twice and allocates both
  copies: about 13.7 MiB per frame at 1850x968.
- Three `dataset` writes on `<html>` per painted frame, changed or not.
- The animation-frame loop never parks; `updateCursor()` touches the DOM every frame.
- `pushRecord()` encodes three strings per input record; pointer motion is one
  record per event into the 256-record ring, which drops records, keys
  included, without a counter or a signal.
- The canvas backing store is reallocated whenever a program changes its size.
- Nothing reports page memory, copies, drops or frame timing.

## Done when

- Baseline and result are recorded here.
- A browser test fails if a key record is dropped silently.
- Terminal, display and game tests pass in Chrome and Firefox.

## Measurement

A Playwright harness kept as evidence (`build/presenter-evidence/measure.mjs`,
not committed) instruments the page before Dolly loads: typed-array, `ImageData`
and `DataView` constructions and their new bytes, `requestAnimationFrame`
calls, attribute mutations, `putImageData`, canvas size writes and animation
frame gaps. Its C fixture presents full-screen frames paced by
`dolly_display_wait_frame`, changes its size every 20 frames, or holds the
display for 9 s without reading input. Viewport 1850x968 as in the audit, one
frame 7,163,200 bytes; Chrome 151 and Firefox 155, headless and headed on Xvfb.

## Baseline (`c5b9e132`)

| | Chrome | Firefox |
| --- | --- | --- |
| Idle terminal | 0 paints, 0 bytes, 0 attribute writes, 60 frame requests/s | same |
| Full-screen frames: allocated per paint | 7.42-7.50 MB (one frame, 1.04 with torn retries) | 7.47-7.50 MB |
| Allocated per second | 369-418 MB at 50-56 paints/s | 410-417 MB at 55-56 paints/s |
| Attribute writes | 3 per paint, 149-168/s | 164-168/s |
| GC in 4 s of frames | 25-32 scavenges, 18-20 major, longest 1.7 ms | not measured |
| Page frame gaps | none over 16.7 ms (one 517 ms stall in one headless run) | none over 17.2 ms |
| Program frames later than 25 ms | 54 of 478, worst 35 ms | 59 of 475, worst 33 ms |
| Key to painted echo | median 25.0 ms, p95 36.8 | median 22.2 ms, p95 35.9 |
| 200 keys typed at `sleep` | 144 of 400 key records dropped, nothing reported | same |
| 320 pointer moves then 10 keys at a program not reading | 65 moves and all 20 key records dropped, nothing reported | same |

What the audit had right and wrong:

- One copy is allocated per paint, not two: `new ImageData(array, w, h)` keeps
  the array (`image.data === array` in both browsers). The second copy is
  `putImageData` into the canvas, which a 2D canvas cannot avoid.
- An idle terminal paints nothing, so it did not pay the per-frame cost; it
  paid 60 animation-frame callbacks a second.
- The churn caused about five major collections a second in Chrome, each
  under 2 ms, and no long page frame. The "28-42 ms gaps" are two or three
  frame intervals seen by the program: the Worker retried a deferred
  `wait_frame` only on its 16 ms tick, so one frame in nine was late and the
  page painted 50-56 of 60 frames.
- Input loss is real and silent, for keys in the terminal and behind pointer
  motion under a lease.

## Changes (`host/display/display.mjs`)

- **Presenter.** One `ImageData` and one view of each frame buffer per frame
  size; a paint is one copy out of shared memory and `putImageData`.
  `data-terminal-cols/rows` are written when they change, `data-frame-sequence`
  once per paint (tests read it). The cursor style is written on change.
- **Parked loop.** It requests animation frames while frames arrive, a program
  holds the display, or input was sent in the last 250 ms. Otherwise it waits
  with `Atomics.waitAsync` on the frame sequence; the Worker's `service()`
  notifies on a new frame, lease or cursor, and `pointerlockchange` wakes it.
- **Page-to-Worker wake-ups.** The page notifies the event-write word for
  records a reader consumes (all under a lease; keys, text, paste and focus
  for the terminal) and the animation-frame word; the Worker then retries
  deferred calls (`runtime.serviceDeferred`, as `audio` and `gpu` do) instead
  of waiting for its tick. The terminal's own pointer, scroll and resize
  records stay on the tick, which handles them all before drawing one frame.
- **Records.** Strings are encoded into one scratch buffer and empty ones not
  at all; one `DataView` for the transport.
- **Motion.** Relative deltas add up and the newest absolute position wins;
  one sample per animation frame, ahead of any other record.
- **Screen text for tests.** `visibleTerminalText()` returned on any
  publication of the selection, so a frame drawn between its press and its
  drag gave empty text (3 of 16 Firefox runs of the new test once readers woke
  on input). It now waits for the press to clear the selection, then for the
  selection (13 of 13).

## Decision: a counted, surfaced drop, no page-side queue

The ring in Wasm memory stays the only queue of input.

- The kernel's rules act on the ring: it handles the terminal's UI records
  ahead of unread keys and discards pending input when the foreground program
  or the display owner changes. Records queued on the page would be out of
  their reach and arrive at the wrong program.
- A page queue needs its own bound, so it needs this drop rule anyway, plus a
  poll to drain it. Mutable userspace state belongs in Wasm memory.

The rule: motion is a sample kept on the page, sent while more than half the
ring is free (or ahead of a record that leaves room for both), so it never
takes a key's slot and a program that does not read delays it without losing
it. Any other record needs a free slot. One that finds none is lost: the page
counts it in `data-input-dropped` on `<html>` and shows a status line. Resize
is retried by its caller and paste reports its own refusal, as before.

Left for `20261002-072000-input-host-module`: a program cannot see the count,
and a release lost with 256 records unread leaves its key down for the program
until the key is pressed again. The `input@0` mailbox should carry a dropped
counter word so programs can resynchronise; that is a contract change.

## Decision: the canvas keeps the frame's size (§5)

Measured with a program changing size three times a second: a paint that
resizes the canvas takes 3.4-5.1 ms on average (worst 9-19 ms) against
0.8-1.2 ms for the others, with at most one page frame gap over an interval
in 300. A fixed maximum backing store would hold 37.7 MB (4096x2304) for
every session instead of 7.2 MB at this geometry, and `canvas.width/height`
is what tests and pointer mapping read. Not worth it.

## Result

All four configurations, same harness:

| | Chrome | Firefox |
| --- | --- | --- |
| Idle terminal | 0 frame requests/s | 0 |
| Full-screen frames: allocated per paint | 0 bytes, 0 objects | 0 bytes, 0 objects |
| Attribute writes | 1 per paint, 60/s | 57-60/s |
| GC in 4 s of frames | 4-5 scavenges, 0-4 major, longest 6.1 ms | not measured |
| Paints per second | 59.8 | 57-59.9 |
| 200 keys typed at `sleep` | 144 dropped, `data-input-dropped=144`, status shown | same |
| 320 pointer moves then 10 keys at a program not reading | all 20 key records arrive; 128 position records, none dropped | same |
| 320 relative motions then 10 keys | all keys arrive; 126 records carry the exact sum | 46-129 records, exact sum |

The machine was busier during the result runs (load average 26-30 on 16
cores), so timings were taken again as two alternating rounds of old and new
code, headless:

| | Chrome old | Chrome new | Firefox old | Firefox new |
| --- | --- | --- | --- | --- |
| Paint, mean (p99) ms | 5.3 (14.4), 6.9 (22.5) | 1.8 (4.9), 2.4 (9.2) | 5.3 (16.4), 5.6 (15.9) | 2.2 (7.1), 2.1 (7.5) |
| Paints per second | 45.9, 43.0 | 58.6, 58.1 | 48.6, 49.6 | 58.2, 57.1 |
| Program frames later than 25 ms | 89, 98 of about 440 | 9, 15 | 60, 60 of about 460 | 9, 17 |
| Key to painted echo, median (p95) ms | 33.3 (52.9), 42.0 (60.4) | 21.0 (32.3), 20.5 (34.1) | 31.3 (44.3), 32.1 (45.7) | 18.4 (36.4), 21.7 (37.1) |

On the quieter machine the new code measured 0 late frames of 481 and a key to
echo median of 12.5 ms in Chrome. One new-code Chrome round had a single 867 ms
program stall under that load; the old code showed a 517 ms one earlier. Neither
is explained.

## Verification

- `test/display-browser.mjs` (new): an idle terminal requests no animation
  frames and output wakes it; 40 motions in a frame are one record; with half
  the ring unread, motion waits and keys still arrive, then the motion with its
  exact sum; with the ring full, received plus reported-dropped key records
  equal the 40 sent and the status is visible. It fails on the old code.
- `node --test 'test/*.test.mjs'`: 251 pass.
- `node test/browser-tests.mjs chromium`: all pass. `firefox`: all pass
  but `host-compute`, which fails the same way on the old code (`gpu@0` has no
  adapter in this headless Firefox). `core` in Firefox failed once in an
  earlier pass at load average 25 with its output cut off (the tail matches
  the 120 s limit closing the browser), then passed 6 of 6. Repeats: `display`
  13 of 13 in Firefox and 7 of 7 in Chrome, `terminal` 6 of 6 in Firefox.
- `npm run test:demos -- sdl2 bhop` and `neovim python emacs`: all pass.
  `slopyard` cannot run on this base: its test reads `demos/slopyard/slopyard.dm`,
  which no longer exists.
- `20261001-095000-terminal-text-flake` describes the empty screen text fixed
  here; its narrowed mouse-drag failure (`terminal-browser.mjs:67`) is a
  different one and did not occur in these runs.
- No kernel, seed or contract change: the only C touched is the test fixture
  `test/fixtures/terminal-ui.c`; image inputs stay `2cc92c2b…`.
