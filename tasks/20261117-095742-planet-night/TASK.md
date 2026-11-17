# Voxel Flyover's night: its performance, rings for beams, the mouse steers

- STATUS: OPEN
- PRIORITY: 300
- TAGS: godot,demo,planet,performance

Owner (2026-11-17 18:40): "the "reward" beams are stupid and don't look good, make them like
circles or something you have to pass through. Apart from that I do notice something has degraded
performance *sometimes* so I want you to focus mostly on performance overnight. Also, I want to
change the steering from wasd to be controlled by the mouse (like an FPS game), and you just always
head forward at a steady speed, except when you pass through the reward. It would be cool to be
able to chain together the rewards while going up (if skilled, shouldn't be easy). Performance is
the key to making this sustainable." And, earlier: "I prefer if it's slow over hacky or like lower
resolution". Brief: `work/briefs-2026-11-17/planet-night.md`.

## State (2026-11-18)

Filled in at the end of the night; the sections below are the record.

## How it was measured

One flight a run, by itself, the browser on CPUs 6, 7, 14 and 15 (two cores, `taskset`), which
the release round was kept off, on the private Xvfb, under the GPU lock
(`build/planet/measure.mjs`, `m.sh`). A run reports the game's own frame times (the time between
two `_process`), the page's (its animation frames in which the GPU Worker had a new frame of the
game), how busy the four CPUs and all sixteen were, and who else was on the NVIDIA card and on the
four CPUs 20 s into the flight. Fixed scenarios:

- **ground**: `--autopilot 60 --day 9`, the morning flight from the start, along a coast and over
  towns.
- **long**: the same for 150 or 300 s.
- **tour**: `--autopilot 100 --day 9 --tour 2 --top 250000`, leaving the planet and coming back.
- **hog**: the ground for 90 s, and from its 25th second to its 45th another Chrome draws thirty
  costly full-screen passes a frame on the same GPU (`build/planet/hog.html`).

Two cores are less than the owner's sixteen threads, so the rates here are low ones; what is
compared is always two runs under the same conditions. The four CPUs were kept from the round
only: the owner's own browser (a WebGPU tab of it used 60 to 100% of the NVIDIA card from 18:42
to 19:06 and from 20:19 to 20:50) and other agents' browsers were on them and on the card, and
a run made beside them says so. A game that draws nothing is also run with Godot's `--headless`
(`c.sh`): its scripts run 60 steps a second of flight as fast as the CPU takes them, without the
GPU or its lock, which is how the rings and the steering were tried many times an hour.

## What was real

**The planet is slower than the flat flyover was, always, not sometimes**, and not by today's
changes. The same morning flight, Chrome on the RTX 5070, one after another on a quiet GPU:

| | frames a second | median frame, ms | p99 | GPU ms a frame |
| --- | --- | --- | --- | --- |
| v0.1.7's image (the flat flyover, its own Godot) | 57.4 | | | 5.4 |
| the flat flyover's project on today's Godot | 55.4 | 17.8 | 37.8 | 5.3 |
| the planet's first project of today (`01d5efeed`) on today's Godot | 34.0 | 29.6 | 42.9 | 7.9 |
| the planet at `39e6de34a` (0.1.8's) | 33.9, 36.9 | 30.1, 28.0 | 42.0, 39.2 | 7.8 |

So: today's Godot (it reads `touch@0`: one more call of the kernel a frame, 0.02 ms) costs
nothing that shows; the day's changes to the game cost nothing; the planet itself, which came in
on the 16th, took the game from the display's rate to 34 a second on these two cores, while the
GPU's own time rose only from 5.4 to 7.8 ms. Over 300 s the rate stays between 28 and 39: no
growth, no stretch that is slow by itself (objects 1,990 to 2,260, nodes 440 to 590, GPU memory
532 MiB throughout).

**The owner's "sometimes" is the game's pacing**, which did the wrong thing whenever another
program used the GPU, and never undid it (Cause 3). On this machine there was such a program
most of the day: other agents' GPU tests, and the owner's own browser.

## Cause 1: asking the GPU's time makes every frame wait for the GPU

The game asked Godot for the GPU's time of each frame (`viewport_set_measure_render_time`), to
choose what an adapter draws and for its report. Godot reads a frame's timestamps back before
the next frame; in Godot's WebGPU driver for Dolly that is a query resolve, a copy, a submit and
a mapped read (`timestamp_query_pool_get_results`), and the game's thread waits for the GPU each
frame. In a V8 sampling trace of the flight the game's thread computed for under a tenth of its
time; counted in the process Worker (`measure.mjs --syscalls`), it waited in `gpu@0` dispatches
for 66% of it: 9.1 dispatches a frame, 19.6 ms a frame of 29.

Without the question (`--project` of the same game with that one line and the pacing out): 56.2
frames a second, median 15.3 ms, against 34 to 37 and 28 to 30. The flat flyover asked too, and
its cheaper frame still made the display's rate.

Fix: the GPU is timed only for an answer (main.gd's `pace`): at the start, when most of a
second's frames came late, and below the first level every ten seconds. A flight by itself
times it over its last second and a half, for its report, and does not count those frames.

The driver could answer without the wait (ask for a frame's timestamps as it ends, read them two
frames on): a change to Godot's Dolly platform, which every project that asks for render times
would gain by, the editor's profiler among them. Not done tonight: it takes a build of Godot and
of its editor, three hours under the round. Filed as
`tasks/20261117-121059-godot-timestamps-wait`.

## Cause 2: the flight's look at the ground, 7 ms of script a frame, and a long frame every lot

The flight looks at the ground at some thirty places a frame (the twelve of the next second and
a half, ten around the camera, the sea, the slope), each a height of some twenty noises in
GDScript, and for each the building on its lot (five more heights and the climate). Timed in the
script, on these cores: `fly` 2.8 to 4.6 ms a frame, `follow` 1.7 to 4.1, with frames of 35 to 58 ms
every 0.6 s, each time the look ahead came to a new lot of 16 units.

Fix (terrain.gd's `ground`, `tops`): heights between the points of a lattice of 4 units, each
computed once, and a lot's building once. `fly` 0.7 ms, `follow` 0.2 to 0.3, and in a flight of
30 s no frame of over 28 ms before its report's.

## Cause 3: the pacing left a level for another program's sake and never came back

`pace` took the mean GPU time of twenty frames, went a level down when it was over 14 ms, and
back up only after a minute of means under 4.9 ms. Another program on the same GPU makes the
game's frames long by Godot's timer (it times passes by the clock, while the GPU serves others
between them). The levels' own costs, measured by holding each for five seconds (the least of
the frames, since the owner's tab was on the card):

| level | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| scale | 1.0 | 0.8 | 0.7 | 0.6 | 0.55 | 0.5 | 0.27 |
| RTX 5070, ms | 7.9 | 7.5 | 2.9 | 1.6 | 1.5 | 1.4 | 0.9 |
| AMD 13c0, ms | 246 | 205 | 75 | 42 | 36 | 34 | 18 |

So on the RTX 5070: once off the first level, the game could not come back to it (the second
costs 7.5 ms, and the way up asked for 4.9), and a game that had reached the last level stayed
held to 30, 20 or 12 frames a second, because that hold was set there and never let go. Seen
tonight, not staged: beside the owner's own WebGPU tab, in Firefox on the NVIDIA card, 0.1.8's
game went to the third level (scale 0.7, no smoothing by samples, two shadow cascades) and drew
38.8 frames a second; in Chrome, while that tab took the whole card, it went to the last level
and drew 3.0.

Fix (`pace`): the answer is the least of fourteen frames, which another program does not make
long every one of; once a level has held, it is left only for an answer half as much again over
the budget (the game is rather slower than softer); a level up is tried every ten seconds when
the answer, times what the level above costs more (the table's ratios, until the adapter has
told its own), is under the budget, and it goes on up at once while that holds; the hold on
the rate is let go when the answer is under the budget. Beside the owner's tab the new game
stayed on the first level in Firefox and drew 51.5 frames a second.

## Before and after

(filled in below as the runs come in)
