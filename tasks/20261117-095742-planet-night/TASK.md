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

The pacing's logic by itself, without a GPU (`build/planet/mkpace.py`: the game run with Godot's
dummy renderer, its pacing told the RTX 5070's cost of each level, four times as much from the
20th to the 40th second of a flight of 150 s, as beside a program that takes three quarters of
the card):

| | the levels it went to, and when |
| --- | --- |
| 0.1.8's | 1 at 20.1 s, 2 at 20.6 s; 1 at 80.4 s; on 1 to the end |
| now | 1 at 31.0 s, 2 at 31.3 s; 1 at 42.1 s, 0 at 42.5 s |

## Before and after

Before is 0.1.8's game (`39e6de34a`), after is `22140c51b` (causes 1 to 3; the rings and the
steering come after it and have their own numbers below). Each pair is the same morning flight,
one run after the other under the same conditions; "frames" are the game's own.

| | frames a second | median, ms | p95 | p99 | longest | over 2x, 4x the median | GPU ms | level |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NVIDIA, Chrome, a quiet card, before (19:06, 19:22) | 33.9, 36.9 | 30.1, 28.0 | 36.4, 34.7 | 42.0, 39.1 | 55.6, 61.8 | 0, 0 | 7.8 | 0 |
| after (19:42) | 60.0 | 16.7 | 26.8 | 28.9 | 72.3 | 8, 1 of 3,439 | 8.1 | 0 |
| NVIDIA, Chrome, the CPUs 83% busy, before (21:20) | 31.8 | 31.2 | | 51.5 | 97.1 | 2 | 7.8 | 0 |
| after (21:14) | 47.3 | 19.1 | 37.4 | 49.0 | 98.1 | 111, 3 of 2,672 | 8.2 | 0 |
| NVIDIA, Firefox, beside the owner's tab (64% of the card), before (20:36) | 38.8 | 25.1 | 33.5 | 47.1 | 74.2 | 18 | 5.6 | 2 |
| after (20:32) | 51.5 | 18.6 | 26.5 | 40.2 | 117.1 | 34, 13 of 2,908 | 16.2 | 0 |
| AMD 13c0, Chrome, before (18:54) | 23.7 | 41.7 | 48.4 | 52.8 | 74.5 | 0 | 19.4 | 6 |
| after (21:53) | 29.6 | 33.4 | 40.2 | 46.0 | 83.7 | 8, 0 of 1,611 | 19.3 | 6 |

The game's test on the image of `22140c51b` (30 s on the ground, then 100 s that leave the
planet to 263,000 units; the page 1600 by 900):

| | ground: frames a second, median, p95, p99, longest | leaving: frames a second, median, p95, p99, longest |
| --- | --- | --- |
| NVIDIA, Chrome, two cores (20:11) | 60.0, 16.6, 18.4, 20.5, 61.3 | 60.0, 16.7, 20.6, 27.4, 71.2 |
| NVIDIA, Firefox, sixteen CPUs, load 30 (21:18) | 58.3, 16.7, 24.5, 38.7, 89.3 | 58.5, 16.8, 24.9, 38.0, 81.4 |
| the afternoon's, 0.1.8's game (load 15 to 20): Chrome | 17.8, 50.8, , 122.3, 148.7 | 33.3, 31.4, , 52.4, 86.7 |
| the afternoon's: Firefox | 29.7, 33.1, , 54.0, 86.7 | 37.0, 25.8, , 46.2, 89.6 |

On the AMD GPU the game now holds "an even 30": it is on the last level two seconds after its
start (a level asked at 0.6 s, the next at 2.0 s), its frames 33.4 ms apart in the median and
40.2 at the 95th percentile, where they were 41.7 and 48.4 while each waited for its own timing.

## Rings instead of beams

The beacons, their shafts of light and the thermals over towns are gone (`shaft.gdshader`,
`thermal.gdshader`, and the nodes, lights and materials of 25 beacons, each tended every
frame). A reward is a ring to fly through: a six-sided hoop of glass with three motes circling
it, in its chain's colour (the beacons' four), amber once passed
([`ring.gdshader`](../../demos/godot/voxel-flyover/ring.gdshader)). Passing through counts, gives
the boost and a note; missing does nothing. The light that runs out over the ground and the
warmth that melts the snow now come from under a passed ring.

- **Chains** (`chain_of`): seven plots of 300 units in ten have one, of three to six rings
  (4.5 on average: of 900 plots around the start 627 have a chain). The first ring hangs nine
  units clear of the ground and the roofs under and beside it. Each next is 105 units on and
  higher, up a way that steepens from 17 to 37 degrees and round a bend that tightens (12 to
  22 degrees at the first, a quarter more at each next), and narrower (7 units of radius, then
  6.5, 6, 5.5, 5). A chain's top is 72 to 284 units over its first ring, 182 in the median.
- **Chaining**: a chain's first ring is always open. The next opens as one is passed and closes
  2.8 seconds later; the boost (26 over the board's 30, to 1/e in 2.5 s) covers the 105 units
  in 2.23 s for a hand that turns at once. A ring flown through asleep does nothing; a chain
  let lapse starts again at its first ring. The open ring beats, faster as it closes; the
  others of its chain are faint. Each ring counts once in the score; the note rises along a
  chain.
- **How hard**: the probe's test pilot (`build/planet/probe.gd --pilot`), which aims at the
  open ring and turns no faster than a given rate, makes whole chains of six at 3 and at 1.2
  radians a second (2.23 to 2.27 s a ring). Made to see each new ring late and hold its course
  meanwhile, it still makes them 0.45 s late and loses most second rings 0.6 s late. A person
  also has to aim: it is meant to take practice.
- **One thing to draw**: every ring with its motes is an instance of one mesh, placed, faded in
  with the distance to its chain's foot, coloured and lit by its shader; how a ring glows is
  written into the instances' data when it changes. A frame of the flight has 270 to 277 draws
  where it had 270 to 570, and the game's scripts and scene take 0.7 ms a frame with Godot's
  dummy renderer where they took 4.7.
- The corgi flying itself makes for first rings and for the open ring of a chain it is in, as
  steeply as it dares (26 units a second): it gets a second ring now and then.

## The mouse steers

- The pointer the page captures at the click turns the heading: 0.0025 radians a pixel, around
  and up and down (to 77 degrees), with no smoothing between the hand and the heading. The board
  flies the way it is headed at 30 units a second; nothing but a ring changes that near the
  ground (the dive's gain, the climb's loss, the wind, the skim over the sea, the flock's and
  the slopes' and thermals' lift are gone). No key steers; Enter no longer takes the board (a
  click or a touch does), Z and X no longer zoom (the wheel does).
- The player's camera looks the way the board is headed, from 15 units behind and 5 over the
  flyer, so what the board will reach is in the middle of the screen, over the corgi's ears,
  and a small ring marks it. (With the view that looked down at the flyer from behind, the
  corgi hid the ring it flew at.)
- The ground still turns the board away: its nose is raised in time for what stands on the
  way of the next second and a half, and held ten units over the ground or the sea it comes
  level.
- Touch: the first touch takes the board, a finger's drag steers as the mouse does (a drag
  across the screen's shorter side as 1,080 pixels), two fingers zoom, the ring at the top
  right gives the board back. The stick is gone.

## Orbit, against "a steady speed"

Kept: over 420 units the board is faster the higher it is (twice as fast every 110 units), by
its height alone. Chosen over reaching orbit by ring chains only, because:

- The planet seen whole is what the owner called "completely awesome" on the 17th; behind a
  chain that "shouldn't be easy" most flights would never see it.
- The speed there is not the player's doing: no key or dive changes it, and at any one height
  it is one speed. It is the scale of what is flown over that changes, and the board's speed
  with it; near the ground, where the rings are and the flying is done, it is 30 and a ring's
  boost, as asked.
- The chains lead to it: a chain's top is 250 to 300 units over the ground, and a board that
  leaves it nose up with its boost is past 420 three seconds later. So the skilled way off
  the planet is a chain, and the plain way is to hold the nose up: 18 s to 420 units at 45
  degrees, and under a minute to where the planet is whole.
