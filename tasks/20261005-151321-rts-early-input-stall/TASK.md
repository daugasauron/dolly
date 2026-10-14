# RTS match freezes when player input arrives in its first frames

- STATUS: CLOSED
- PRIORITY: 190
- TAGS: demo,rts,tests,flaky,bug

## Fixed (2026-10-14)

The cause is upstream's frame timer, and the fix is in the port's own
`demos/rts/arena.cpp`: the match begins once the game's clock has passed
1000 ms.

- The game's clock is `SDL_GetTicks()` (`Misc::get_time`), milliseconds since
  the engine started. `Sys::should_next_frame` (upstream `src/OSYS.cpp:1492`)
  reads a next frame due before 1000 ms as a 32-bit clock that wrapped, and
  then lets the frame run only while the clock is still under 1000. A frame
  due at 998 or 999 ms that the loop does not reach before 1000 ms is never
  run: that player's simulation stops for good while it keeps drawing, and
  the other waits for it in lockstep. The arena starts a match within the
  engine's first second; a game started from the menus never does.
- Seen in a transport log of both engines (temporary, kept in
  `work/evidence-2026-10-14/rts/arena-trace.diff` with the logs): in one stall
  player 1 sent its frame-16 message at 949 ms (next due 999), next looked
  at 1030 ms and sent nothing more, while player 2 had sent through frame 18
  and waited; in another player 2's last frame went at 948 ms (due 998). An
  input or a screenshot at that moment is what makes the loop late, hence
  "early input".
- With the fix, pinned to two processors, the loop passed 24 rounds of 24
  (`rts-loop-fixed.log`), against 14 stalls in 52 rounds before it the same
  afternoon; the demo's test passed (261 s); source tests 430/0.

## State (2026-10-13)

Open and reproduced on today's tree: the match loop of "Evidence", 20 rounds in one `rts-arena`
session (main `4ed1d9ef` with the Janis reader fix `cb9ae5cd`, Chromium, load 9), stalled in 2
of 20, rounds 13 and 16, both with "mouse menu/quit must not stall either player": frames 17
and 18 at 1.3 s after launch and the same two frames 6 s later. The other 18 rounds took 36 to
39 s each. So it does not need the 2026-10-08 process entry or an image build beside it. A
second loop of 24 rounds an hour later, with Pi's demo test running beside it, stalled in none:
2 of 44 today.

Not found: which early step freezes the match. Read on 2026-10-13 and not the cause by
reading: the fixture's relay between the two engines and Janis's child pump (one read and one
write a child a pump, at most 10 ms apart; `write` reports back-pressure only past 64 KiB), the
engine's pipe transport (`demos/rts/arena.cpp`, non-blocking, framed), and the guards that keep
a player out of the menus. Upstream's `Sys::is_mp_sync` waits for the other player's
`MSG_NEXT_FRAME` and asks for a resend after 2 s, which the fixture's 5 s does not outlast by
much: whether a stalled match recovers on its own is not measured.

Next, as "Work" has it, with a loop that keeps what a failed round leaves and waits 30 s before
it gives up: `build/polish-evidence/rts-loop.mjs` with `RTS_FIXTURE=…/rts-match-probe.mjs` (not
committed) opens `rts-arena`, chooses the shell, fetches the fixture and runs it; the copy of
the fixture watches a stalled match for thirty seconds and prints both engines' `inputs.log`.
It was what ran the second loop, so it has caught nothing yet.

## The defect

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

## Seen again (2026-10-14, the round)

The round of 2026-10-14 (`integrate/round-1014`, every demo suite in one
run after the core suite) failed `rts` alone with "mouse menu/quit must not
stall either player", frames 17 and 18 before the input and after it
(`build/round-1014-evidence/demos.log` in `work/rust`). The same test passed
alone right after, at load 0.7, in 258 s. 26 other demo suites passed.

## A reproducer, and the relay ruled out (2026-10-14)

Pinned to two processors the loop stalls often:
`RTS_FIXTURE=build/polish-evidence/rts-match-probe.mjs taskset -c 4,5 work/slot.sh browser node build/polish-evidence/rts-loop.mjs 20`
stalled 8 of 20 rounds, then 3 of 8; with a probe that also counts the
fixture's relay, 0 of 8 and 3 of 16. In all, 14 of 52. The loop, both probes
and the logs are in `work/evidence-2026-10-14/rts/`.

- The stalled player's frame counter stops at an input. In one stall player
  1 took the first click at (755, 25) on frame 17, the second click and the
  one-second wait on frame 17 too, and stayed there; player 2 stayed on 18.
  Another stall came at frames 8 and 9, during the first cursor moves,
  before any click. So it is an early input, not the menu click.
- The relay between the two engines is idle at a stall: neither stdout was
  paused, no write waited (`writableLength` 0), and every byte an engine
  wrote was passed on (at frames 8/9: 13 chunks, 403 bytes from player 1;
  11 chunks, 490 bytes from player 2). Janis's child pump and back-pressure
  are not the cause.
- So the engines deadlock in their own synchronization after the bytes have
  reached them. Next, which needs `rts-build` and `rts-arena` rebuilt with
  a log: what each engine's `dolly_rts_receive` took (frame, size) and why
  `Sys::is_mp_sync` keeps waiting (`remote_send_success_flag`, the other
  nation's `next_frame_ready`, `ec_remote`'s state).

