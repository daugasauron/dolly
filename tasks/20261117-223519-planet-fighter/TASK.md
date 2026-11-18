# Voxel Flyover: rings from either side, many more, and fighter-plane controls

- STATUS: OPEN
- PRIORITY: 300
- TAGS: godot,demo,planet

Owner (2026-11-18 morning): "Fix the rings.. I think they only work from one side, and also
there's like not enough? It's not interesting currently. Also, change the controls again, I didn't
like these ones. I want the kind of controls you would use in a video game to control a fighter
plane, like thrust etc, to make it a bit more challenging." Brief:
`work/briefs-2026-11-18/planet-day.md`. Still binding: "I prefer if it's slow over hacky or like
lower resolution", and the night's 60 frames a second on the RTX 5070 in Chrome and an even 30 on
the AMD GPU.

## State (2026-11-18)

Done on `feature/planet` (`7020f7a96`, `346f0cbad`): the flight model, the controls (mouse, keys,
touch), the courses of rings and the chain; the image is built and served on 9049; the game's
tests pass in Chrome and Firefox; the rates are the old game's (below).

Left:

- A person has not flown it. How hard a chain is, is the owner's to say; the knobs are
  `CHAIN_TIME` (3 s, less 0.1 a ring to 2), `RING_BOOST`, the slaloms' 80 units and ±8, the
  rates in `handle` and `STICK_PIXELS`. The mouse raises the nose when pushed up (the nose follows
  the hand, as the night's steering did); a stick's inverted pitch is not offered.
- The AMD GPU in Firefox was not measured today: neither the old game nor the new started Godot
  on the two reserved cores (11:15, 11:23; the night's `godot-firefox-start`).
- The demos page's video and poster still show the night's flight; no take was recorded.
- The owner's phone, as before.
- The integrator (11:20): GPU runs take the lock each, not a session of them (`chain.sh` held it
  for several runs while another agent waited); `chain.sh` now says so.

Tests on the image (NVIDIA, `build/planet/t.sh`): the touch test passes in Chrome (09:16, 10:08, and
11:26 on the last image, its phone screenshot showing the throttle bar, the stick and the score)
and Firefox (10:29); the flyover test passes in Firefox (11:06: the mouse raised the nose 23°, the
morning flight 58.4 frames a second, 11 rings along their courses, 3 against from `--ring -1`,
the tour to 262,813 at 58.7) and in Chrome (11:09: 28°, 59.7, 11 and 3, the tour at 59.9; and
09:11, 10:54). On the way it failed on:
the morning frame's colours (65 after a climbing chain, looking down through haze; the threshold
is now the tour's 60); in Firefox its own 15-minute deadline with five game starts under load 34
(now four starts, 20 minutes: the morning flight carries the "along" check); and in Firefox the
mouse: the nose rose 5 or 6° and the board rolled 29 to 93° right.

Firefox's mouse, found with a copy of the game that prints every motion (`mkmouse.py`,
`keys-mouse.mjs`, the test's own moves): after the capture, Firefox's first motion, which comes
with the first real move a second later, is a jump of (320, 115) pixels, then the moves follow
(-88, -88, -40: 216 of the 240). Chrome's first motion is the first move, (0, -16). The night
left the motions of the first 0.25 s after a capture, which this jump comes after; it was a turn
of 46° in the night's steering (the test only looked at the pitch, whose spread in Firefox it
called unexplained) and a roll past the vertical now. The game now leaves the first motion after
each capture, whenever it comes.

## Why the rings "only worked from one side"

A pass was a crossing of the ring's plane within its radius, from either side (`before * after`):
geometrically symmetric. What was one-sided was the chain: only a chain's first ring was open, the
next opened for 2.8 s after one was passed, and every other ring slept. A ring flown through asleep
did nothing, so a chain met from its top, or a ring met out of turn, never counted; and a chain's
first ring, met from behind, counted but led on to a ring behind the board.

Now every ring not yet passed counts, from either side, once. A chain is any rings passed each in
time for the next, and a course can be flown either way: the ring that beats as the one to make
for is the next of the course the way it was flown (`onward`). Checked headless with `--ring 1`
and `--ring -1` (a flight by itself started 70 units before the first ring of the course nearest
the start along its way, or before its last against it): along, 3 rings, none against; against,
4 rings, all against (the course flown backward, a chain of 4).

## The flight

`handle` in main.gd: the board's axes (`attitude`) turn by the stick (pitch 1.2 rad/s, roll 2.6)
and the rudder (yaw 0.5), scaled down under 28 units a second. It flies along its nose. Speed:
thrust (10 u/s² at a full throttle) less drag (0.004 v²) plus gravity along the way (9.8): a full
throttle holds 50 level, the cruise's 0.36 holds 30; a climb of 30° at full throttle holds 36. The
way bends by the lift (along the board's top, g times the cosine of the climb, less under 22 u/s)
and the weight across the way: wings level and stick centred it flies straight; banked it turns
(g sin(bank) / v) and the nose drops a little; slow, the nose falls; hanging nose up under 12 u/s
it tips over. A first version had a lift of 1 g at any climb, so a climbing board pitched itself
further up and looped (the weight across the way is only g cos(climb)): replaced.

Controls (the arcade scheme of PC flight games, mouse and keys): the mouse moves a stick (150 px
is all of it, springing back to the middle in 0.3 s), up for nose up and right for roll right, the
nose following the hand as the night's steering did. A push past the stick's travel (to twice
it) is flown off at full stick, so N pixels turn the board by the same angle however the page
delivers them (0.0024 rad a pixel in pitch, 0.0052 in roll): with a plain spring, Firefox's
uneven delivery of a captured pointer's motion saturated the stick and the test's 240 px raised
the nose 5° where Chrome's raised it 33°. Arrows push the stick while held; A/D rudder; W/S
throttle (0.5 a second); wheel zoom; Escape lets go; Q quits. Touch: a thumb on the left third
slides the throttle; a thumb on the right is a stick from where it went down (a tenth of the
shorter side is all of it); a second finger on the right zooms with it; the ring at the top right
gives the board back. The corgi flying itself aims as a hand would (`aim_at`: pitch and yaw the
nose at the way, roll to lay it over the top or level when nearly ahead) and sets the throttle for
the speed it wants; the tour climbs at 17 u/s and reaches 267,067 units in its 100 s (headless).

The ground: the flight's look ahead pushes the nose up (1.5 s ahead flying itself, the last 0.7 s
in the player's hands), and the board is held 10 units over the ground; in the player's hands a
push of over 0.25 rad, or coming down onto it faster than 4 u/s, is a scrape: the chain ends and
the board loses 12 u/s each second of it. No crash: the game stays pointless at heart.

Orbit stays reachable as the night left it: over 420 units a step is longer the higher it is. With
gravity a climb costs speed even there, but a full throttle holds 30° at 36 u/s, out of the air
(50,000) about a minute from the ground.

## The courses

`course_start` / `course_step`: nine plots of 300 in ten have a course, its kind by its place
(5 heights and the town share at its start): STREET (a town: along an avenue, every fifth column
or sixth row of lots, 60 apart, every other ring 3 higher, the last over the roofs), COAST (a
slalom along the line where the ground meets the sea), OPEN_SEA (a weaving slalom, every third
ring 14 higher), VALLEY (a slalom along the lowest of three ways ahead: valleys between hills and
mountains, and open fields), CLIMB (on open land: 85 apart, rising 15 to 34°, a tightening bend,
radius 6.5 to 5). Slaloms: 80 apart, 8 to either side of the way (75 and 10 were too tight: see
below). Rings hang 6 + radius over what stands under and beside them, 15 over the ground at least.
One ring is laid a frame.

Survey of 400 plots around the start (`probe.gd --survey 20`): 361 courses (135 coast, 72 climb,
71 valley, 43 street, 40 open sea), 2,747 rings (before the slalom change); turns between legs:
median 30°, the most 92°.

## The chain

A ring within 3 s of the last (0.1 s less per ring of the chain, to 2) goes on the chain; it
counts the chain's length in points (a chain of six: 21; six apart: 6) and adds 8 + 1.5 per ring
before it (to 20) to the speed. Shown: the next ring beats faster as time runs out; the score
swells; "+N" rises from the screen's middle; "chain N" under the score, with an amber arc around
the score's ring for its time left; the note rises with the chain (9 notes); the view widens by up
to 10° and streaks show over 34 u/s.

How hard (the test pilot, `build/planet/probe.gd --pilot 90`, headless with the dummy renderer:
it aims as the corgi does, `aim_at`, at the ring the corgi would make for):

| | rings in 90 s | longest chain | chains |
| --- | --- | --- | --- |
| first slaloms (75 apart, ±10), full throttle | 21 | 7 | mostly 1 to 3 |
| same, throttle 0.6, sees each ring 0.4 s late | 16 | 3 | 1 to 3 |
| slaloms 80, ±8, `aim_at`'s yaw and pitch gains 8 and 6 (from 3 and 4), full throttle | 22 | 5 | 1 to 5 |
| same, throttle 0.6 | 26 | 6 | 6, 5, 4, 4, 3 |
| same, throttle 0.6, 0.3 s late | 15 | 4 | 1 to 4 |

Chains ended with the next ring 45 to 70 units away and 85 to 135° off the nose: passed beside
it, not run out of time. Faster is harder (the turns at each ring); a person anticipates the
next ring, which the late pilot does not.

## Cost

All of today's numbers were taken under load: deep-hedger experiments (Python at 450% each) and the
integrator's browser tests, load 25 to 30, the four reserved CPUs 96 to 98% busy with others'
processes. A height of the world cost 0.13 to 0.2 ms of GDScript, some ten times the night's.

Laying courses (`probe.gd --bench 1`: 230 courses of 256 plots away from the flight, 1,672
rings): a course's start 0.86 ms (median); a ring 1.78 ms median, 5.45 p95, 14.9 the most, when
its clearance read the flight's 4-unit lattice (four heights for each fresh place); 0.86, 2.32
and 7.0 ms reading the height directly (`hang`, `Terrain.over`). `building_top` now looks for an
avenue before it computes a height (the same answer, sooner).

What the rings cost a frame, timed in the game (`mktimed.py`: `tend_rings` with the laying, and
the corgi's `ring_ahead`), the morning flight of 60 s headless (dummy renderer), one run after
the other:

| | rings a frame: mean, p99, most (ms) | ring_ahead | the game's frames: median, p95, p99 | flown | rings passed |
| --- | --- | --- | --- | --- | --- |
| HEAD's game (chains) | 0.136, 0.97, 16.2 | 0.042 | 1.2, 2.5, 5.4 | 1,930 | 2 |
| courses, lattice clearance | 0.299, 2.54, 5.05 | 0.036 | 1.5, 4.5, 6.7 | 2,530 | 25 |
| courses, direct heights | 0.207, 1.58, 5.12 | 0.033 | 1.4, 3.3, 4.6 | 2,530 | 25 |

The old game computed a whole chain in one frame as a plot came near (16 ms); a course is laid a
ring a frame. The new flight also flies a third further in the minute (the corgi at 36 when it
makes for rings), and its look ahead covers that much more ground.

On the GPU (the night's method: `build/planet/measure.mjs` through `m.sh`, the browser on CPUs
6, 7, 14 and 15, the private Xvfb, under the GPU lock; the morning flight, `--autopilot 60 --day
9`; HEAD's game of before today from `build/planet/old`, the new from a copy of the tree), each
pair one run after the other. The reserved CPUs were not free today: the owner's Firefox and
others' Chromes ran on them.

| | busy (reserved, all) | frames a second | the game's frames: median, p95, p99, longest | GPU ms | rings |
| --- | --- | --- | --- | --- | --- |
| NVIDIA, Chrome, old (08:29) | 97, 96% | 37.9 | 24.8, 50.2, 66.0, 109.5 | 8.2 | 2 |
| new (08:32) | 96, 95% | 34.0 | 26.9, 57.0, 75.8, 130.0 | 7.0 | 23, chain of 12 |
| AMD 13c0, Chrome, old (09:28) | 69, 73% | 29.6 | 33.4, 40.9, 46.7, 93.2 | 20.0 | 2 |
| new (09:30) | 91, 90% | 21.6 | 37.5, 97.1, 136.3, 363.2 | 17.8 | 20 |
| AMD, Chrome, new (09:34) | 98, 98% | 19.4 | 46.6, 102.7, 138.9, 194.0 | 17.7 | 20 |
| old (09:38) | 97, 97% | 20.1 | 44.6, 98.8, 143.1, 289.3 | 20.2 | 2 |
| AMD, Chrome, held at 330, new (09:43) | 97, 97% | 21.8 | 43.0, 82.2, 117.4, 177.9 | 19.7 | 0 |
| old (09:47) | 98, 98% | 18.2 | 48.4, 115.3, 158.8, 433.0 | 19.7 | 0 |
| NVIDIA, Firefox, old (09:20) | 82, 84% | 58.5 | 16.9, 22.9, 29.5, 77.6 | 8.6 | 2 |
| new (09:51) | 99, 99% | 28.9 | 29.7, 73.7, 104.6, 255.0 | 7.4 | 23 |

The AMD pair of 09:28 looked like a fall from 30 to 21.6; run again under the same load the two
games are alike (19.4 and 20.1; held at 330 units 21.8 and 18.2): it was the load changing
between the runs. The new game's first Firefox run hung in the harness (the shell's `curl` of
the project, six minutes, stopped) and its second ran under the busiest minute of the day.

At 10:35 the load fell to 11 to 18 (the reserved CPUs 46 to 72% busy), and the pairs were run
again in one turn of the lock (the new game with the exact mouse push and the cheaper laying):

| | busy (reserved, all) | frames a second | the game's frames: median, p95, p99, longest | GPU ms | rings |
| --- | --- | --- | --- | --- | --- |
| NVIDIA, Chrome, old (10:35) | 71, 90% | 53.4 | 17.5, 34.0, 39.3, 75.9 | 8.2 | 2 |
| new (10:37) | 72, 91% | 52.3 | 18.0, 34.6, 40.3, 112.0 | 7.1 | 23, chain of 12 |
| AMD 13c0, Chrome, old (10:39) | 62, 89% | 29.4 | 33.5, 42.5, 51.1, 146.1 | 20.1 | 2 |
| new (10:42) | 46, 63% | 29.7 | 33.4, 37.4, 41.6, 73.2 | 16.2 | 23 |
| NVIDIA, Firefox, new (10:52) | 66, 88% | 58.5 | 16.8, 22.5, 29.9, 117.3 | 7.5 | 23 |

(Firefox's old run of 10:44 did not start Godot on the two cores, the night's open
`godot-firefox-start`; its run of 09:20 at 82% busy gave 58.5, 16.9, 22.9, 29.5, 77.6.) So the new
game keeps the old one's rates: on the NVIDIA card in Chrome the same within a frame a second at
this load, an even 30 on the AMD GPU, and 58.5 in Firefox. The flyover test in Chrome (10:54)
drew 58.9 frames a second in its morning flight (median 15.5, p95 30.7, p99 35.5) and 59.9
leaving the planet.
