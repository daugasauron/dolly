# Firefox: Godot's start sometimes hangs before its banner (3 of 7 starts on two loaded cores)

- STATUS: OPEN
- PRIORITY: 250
- TAGS: godot,firefox,bug

## State (2026-11-17)

Seen, not looked into: it is before any of the game's code runs, so it is the platform's (the
process's start, its threads, or Godot's own first steps), and the Firefox agent has the
browser host tonight. Left: to reproduce it with the terminal's text and the page's console
kept, on a quiet machine and on a loaded one, and to say where the process waits.

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
