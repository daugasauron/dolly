# RTS match freezes when player input arrives in its first frames

- STATUS: OPEN
- PRIORITY: 240
- TAGS: demo,rts,tests,flaky,bug

`node demos/run-browser-tests.mjs rts` sometimes fails in
`demos/rts/test/fixtures/rts-match.mjs` with "RTS test timed out: mouse
menu/quit must not stall either player", then waits 240 s for the viewer
(`demos/rts/test/rts-browser.mjs:55`). Both engines stay on one frame while
their view clocks keep advancing, for example frames 9/10 from 1832 ms to
7950 ms. Found while fixing `20261005-140244-signal-regression`; it is not
part of that defect.

## Evidence (2026-10-05/06, Chromium, machine load 20-30)

The match fixture alone, repeated in one `rts-arena` session (leave the
launcher with Escape, fetch the fixture, then per round
`rm -rf /tmp/rts-replay-test && mkdir /tmp/rts-replay-test && janis -m /tmp/rts-match.mjs /tmp/rts-replay-test`):

| tree | change | stalled |
| --- | --- | --- |
| `main` `cb8530a6` | none | 3/6 |
| `fix/signal-regression` | none | 3/8, then 1/8 |
| `fix/signal-regression` | pipe-wakeup trigger removed from the supervisor | 4/6 |
| `fix/signal-regression` | fixture waits for frame 40 instead of 5 before connecting the players | 0/8 |

- It is present on the deployed tree and does not depend on the pipe wakeup
  (`d67ec56e`) or the host-modules batch.
- It depends on how early the fixture acts. Rounds that passed had reached
  frames 22-25 when the first lifecycle input was sent; rounds that stalled sat
  at 5-15. With the players connected only after frame 40, all eight rounds
  passed and reached frames 57-59 by that step, so the engines do not stall on
  their own.
- A stalled round fails in about 9 s and a passing one takes about 43 s, so
  the loop is a cheap reproducer. The full test passed twice in the same hours
  (316 s and 338 s).

Not known: which of the early steps freezes the match (connecting a player,
the first screenshots, the pointer moves or the clicks), whether an idle
machine ever shows it, and whether a real player can hit it. Model players act
seconds after the match starts, later than the fixture.

## Work

Find the step: repeat the loop with the fixture cut down to one early action
at a time, and read what the engine does with agent input before its first
synchronized frames (`demos/rts/input.cpp`, `vga.handle_messages(true)` in
`demos/rts/seven-kingdoms-dolly.patch`). Fix the engine or the input broker if
early input can freeze a real match. Only if it cannot, make the fixture wait
for the frame from which input is supported, and say why there.

## Done when

The match loop passes 20 rounds in a row under load, and the rts demo test no
longer fails at the first lifecycle step.

## Seen again (2026-10-08, the integrator)

The `rts` demo test failed once in a round on `847006a9` (Chromium, two image
builds running beside it): "mouse menu/quit must not stall either player",
frames 18 and 19 before the input and the same two frames 6 s after it. It
passed on the next run (263.9 s) and in both rounds of 2026-10-07.

## A third failure, with another message (2026-10-08, the integrator)

The full run on `main` `522564c0` (07:08 to 07:49, three agents building
images beside it) failed `rts` alone, twice in its log with "both native
games must animate during the slow model's response, not wait for tools".
Every other demo, the core suite in both browsers and the five GPU tests
passed in that run. Since the process entry changed on 2026-10-08 (JSPI in
Chrome) `rts` has failed two runs of three, all under load; before it, it
passed both rounds of 2026-10-07 and stalled in about half the loaded runs
of this task's table. Not yet done: the same count with the entry disabled
and on a quiet machine, which is what would say whether the entry matters.
