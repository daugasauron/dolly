# Firefox: Godot's start sometimes hangs before its banner (3 of 7 starts on two loaded cores)

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: godot,firefox,bug,0.1.8

## Closed 2026-11-19

Fixed on `fix/rc-browser` (216d093a8): the start no longer stops, and the game's test passes in
Firefox on two loaded cores.

**Cause.** The Firefox 159 bug of `tasks/20261117-090000-dh-34`: `new Worker()` in a Worker can
wait for good while Workers it made are ending. dh-34 moved process Workers to the page, and
`fix/rc-core` (`e5e607695`) packages@0's, but threads@0 still made each thread's Worker in the
runtime Worker (`host/threads/threads.mjs`). A program that starts and ends threads, as Godot does
before its banner, then stops the runtime Worker: no call is answered, nothing is printed, no
error. The 0.1.8 round's `godot-flyover-browser.mjs` in Firefox (2026-11-19 11:00, the load 6 to
10) waited its 300 s for the game's 120th frame so.

**Reproduced without the GPU** (`test/fixtures/thread-churn.c`: two threads started and joined,
again and again; the `system` image in the installed Firefox on Xvfb :160, WebGPU off, no load
added): 200 threads a process, a process after another, the page stopped in the 5th process and
in the 4th (2 of 2, some 800 and 1,000 threads). `fix/rc-core` measured none stopped in 5,000
thread Workers (1,000 runs of a program of four threads, at one CPU's worth); there each
program's threads end as the process does, with the shell's round trip before the next process
makes any, so no Worker is made while others end. Here a thread ends and the next is made at
once, as Godot's are.

**Fix.** threads@0 makes a thread's Worker through runtime@0's relay (`pageWorker`), as a
process's (`host/threads/threads.mjs`). A thread the supervisor ends before it starts still ends
itself, so that Chrome lets go of what was posted to it; it now says so (`unstarted`,
`page/process-worker.mjs`) and is terminated then, so the page lets go of its Worker. Review
map: runtime@0's and threads@0's rows; `test/browser-apis.test.mjs`: threads@0 makes no Worker.

**Evidence.**
- `test/thread-workers-browser.mjs` (new, in `test/browser-tests.mjs --display`'s list): 15
  processes of 200 threads. Before the fix Firefox stopped and the test failed at its deadline;
  with it Firefox passed (3,000 threads in 6.3 s) and Chrome (9.0 s). 25 processes of 200
  threads (5,000) ran in the probe with none stopped, 0.4 to 0.5 s a process, as fast as before.
- `test/process-memory-browser.mjs` in Chrome, which dh-34 found keeping a dead process's memory
  with thread Workers made by the page: two seconds after the 20 runs of each of its four
  programs, before the fix +8, -28, +26 and -90 MiB from the baseline (lone samples of +98, +118
  and +145 between); with it +10, -3, +27 and -75, and in a second run -81, +4, +23 and -73
  (Firefox: -93, -3, +11 and -4). Unchanged: the test passes in both.
- `threads`, `process`, `ended-worker`, `dso`, `stack`, `ending`, `boundary`, `csp`,
  `embedding`, `image` and `process-memory` browser tests pass in Chrome and Firefox;
  `test/*.test.mjs` pass.
- The game, on the round's `godot-voxel-flyover` image, Firefox 159 on the NVIDIA adapter (Xvfb
  :160, under the GPU lock), with the fix:
  - `demos/godot/test/godot-flyover-browser.mjs` passed with the browser on all CPUs (the load
    15 to 20) and on CPUs 6, 7, 14 and 15 beside two busy loops there (the load 21): pitch 85, a
    chain of six, both moon crossings, 46.1 and 49.6 frames a second in the morning. Its second
    start in the same page, the autopilot's, drew too.
  - Five starts in new pages on those two loaded cores: 5 of 5 drew on, the first frame after
    9 to 15 s, the 120th after 49 to 71 s (2026-11-17's count without the fix: 3 of 7 stopped).
    Two at 844 by 390 (`tasks/20261117-083224-ffgpu-phone`): 2 of 2, the 120th frame after 32
    and 55 s.

## What was seen

The installed Firefox (snap 9171), `godot-voxel-flyover`'s page, the browser on CPUs 6, 7, 14
and 15 (`taskset`), the machine's load 20 to 40, 2026-11-17 20:16 to 21:10:

- `demos/godot/test/godot-flyover-browser.mjs firefox`, twice: the page printed
  "dolly: executable ready in 0.8s" and nothing more: no "Godot Engine v4.7.2" line, no frame,
  for the test's 300 s (a screen at 3.5 minutes: `build/planet/tmp/x.png` of that time).
- `build/planet/measure.mjs firefox --image`: the game's first start drew and quit at Q; its
  second start in the same page (`voxel-flyover -- --autopilot 20`) drew nothing in eight
  minutes (no packet reached gpu@0).
- Four other starts in the same hour drew: two with the project run from `/tmp` in the
  package's Godot, two of the image's page (`build/planet/ffdiag.mjs`, by the front page's link
  and directly). In those the first frame came 10 s after the page and the second 35 s after
  the first, then 56 frames a second: Firefox makes the first frames' pipelines for half a
  minute on two cores.
- v0.1.7's page in the same Firefox under the same conditions started twice in a row (first
  start, Q, second start) and drew 50.6 frames a second.

The afternoon's runs of the same test in Firefox (all CPUs, load 10 to 20) passed, and so did the
same test on the same image at 21:18 with the browser on all sixteen CPUs (load 30): 58.3 frames
a second on the ground. So it takes the two cores, or what else was on them.

## Done when

The start is reproduced or ruled out as the load's, and the game's test passes in Firefox on
two cores under load, or says why it cannot.
