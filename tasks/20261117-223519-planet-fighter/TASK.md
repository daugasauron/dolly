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

In progress on `feature/planet`: the flight model, the controls (mouse, keys, touch), the courses
of rings and the chain are written and run headless; the GPU measurement, the image and the
browser tests are next.

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
nose following the hand as the night's steering did; arrows push the stick; A/D rudder; W/S
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
