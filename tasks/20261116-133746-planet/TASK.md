# Voxel Planet: Voxel Flyover on a planet you can leave (research, plan, first demo)

- STATUS: OPEN
- PRIORITY: 290
- TAGS: godot,demo,planet,0.1.9

Owner (2026-11-16, 22:20 to 22:40): "Is it feasible to make the world renderer spherical like the
earth with an actual horizon? I want it to still be larger than what would make it realistic for
anyone to do a "lap", so sort of same but spherical?" Then: "Ideally, I also want thing further
out to display, instead of "popping up". I want to be able to see mountain ranges beyond the
horizon etc. Also, ideally... I want to add "space" where it's theoretically possible to go out
into orbit and see all of the "earth". Reflect on this." And: "Skip step 1. Launch a fable5.2
research pass on getting something like this working in a subagent, and implement an initial demo
if realistic. Use a separate worktree. I want to keep the "surface experience" very similar to
what it is now."

Branch `feature/planet` (`work/planet`, from `feature/flyover-4` at `3f2b333e2`). Brief:
`work/briefs-2026-11-16/planet.md`. Research and staged plan:
`work/research/planet-2026-11-16.md`; its stages are the tasks `tatr ls :planet` (stages 1 and 2,
the first demo, are closed: `tatr ls -c :planet`).

## State (2026-11-17, night)

The first demo is done and served: `http://127.0.0.1:9049/godot-voxel-planet/` (unit
`dolly-serve-planet`). `demos/godot/voxel-planet` is a copy of Voxel Flyover's project on a
sphere of 600,000 units (the README's section says how). The surface is the flyover's; the land
runs on to a curved horizon; a board that keeps climbing leaves the air in a minute and a half
and sees the planet whole, round, with its day and night sides, clouds, glint, the rim of its
air and that rim's sunsets; a dive comes back down anywhere. The images `voxel-planet` and
`godot-voxel-planet` build (a minute, everything else reused), the game's test passes in Chrome
and Firefox on both adapters, and the source suite passes. The game on 9048 is untouched.

Left, beyond the stages' tasks:

- **The integrated AMD GPU holds an even 20 a second on the ground, not 30**: the GPU takes 27 ms
  a frame at the weakest level where the flyover takes 19.6 (measured side by side, below). What
  was ruled out is in "The AMD GPU" below.
- **Frame rates on the NVIDIA card could not be measured cleanly**: other agents' browsers drew
  on it and the machine's load was 10 to 19 all night. The GPU's own time a frame is the
  comparable number: 8.9 ms on the ground (the flyover: 7.0 on a quiet machine, 9.8 measured
  the same way as the planet's first runs tonight), 2 to 4 ms in orbit.
- The planet's ground texture is drawn in one frame at the start: 30 ms on the NVIDIA card, 240 ms
  on the AMD GPU (measured by drawing it again mid-flight, `--rebake`).
- Far ground between 30,000 and 300,000 units up is soft (stage 5), and the low clouds seen from
  3,000 to 20,000 units up are only the layer painted on the ground (stage 7).
- A take with a person's hands: see "The take".

## Decisions, with their reasons

- **Radius 600,000 units**, not 1,000 to 2,000 km: a lap at the cruise is 35 hours (19 at the
  fastest), the horizon dips visibly from 5,000 units up, and float32 is four times finer than at
  2,000 km.
- **The clipmap the game has, extended, not a quadtree on a cube**: the same properties with the
  code that is there; the join of two terrain systems is avoided. Far ground is read from one
  texture of the whole planet, so orbit is rigid.
- **A flat chart around an anchor, and a `lift` in every vertex stage**: the game's logic, its
  lattices and its near precision stay the flyover's.
- **The start**: on the equator at longitude 1.3177 rad, found by `planet.mjs equator` (a coast,
  28 % sea within 2,000 units, a town, mountains within 6,000, warm and wet).
- **Speed by height**: twice as fast every 110 units over 420, so the flyover's flight under its
  old ceiling is unchanged.
- **The haze is thinner than the flyover's on the ground** (0.00048 a unit at flight height for
  0.0006) so far ranges show; it thins with height.

## Measures

All on this machine (RTX 5070, integrated AMD; Chrome 156, Firefox 159; private Xvfb `:155`),
with the machine's load at 10 to 19 from other agents' work, which is why the rates are low.

The game's test (`demos/godot/test/godot-planet-browser.mjs`, the image of `a33e6f6be`): 30 s
by itself on the ground from 09:00, then 100 s that leave the planet to 250,000 units.

| | Ground: rate, GPU ms, median, p99, longest, hitches | Leaving: rate, GPU ms, hitches |
| --- | --- | --- |
| NVIDIA, Chrome | 30.9, 8.9, 33.2, 42.2, 58.5, 0 | 27.7, 6.4, 72 |
| NVIDIA, Firefox | 19.9, 9.7, 51.0, 92.6, 155.2, 4 | 43.9, 6.7, 258 |
| AMD, Firefox | 19.8, 26.2, 50.2, 65.4, 76.8, 0 | 24.2, 20.0, 4 |
| AMD, Chrome | 12.4, 25.7, 79.7, 110.8, 132.5, 0 | 21.7, 19.6, 1 |

Sudden changes (the flyover's measure: every frame at a fixed 60 steps a second, shrunk to 120
by 67, in tiles of 8 by 8; a spike is a tile that changes in one frame over 2.5 times the frames
around it):

- The fixed flight on the ground (60 s from 09:00, 12 beacons lit): 33 tiles in 23 frames, none
  of more than 3; 14 events of 8 tiles or more (the camera's changes of view and turns toward
  beacons, as in the flyover, whose last game had 24 tiles in 18 frames on its own way).
- The tour (200 s: up to 316,000 units, 23 moves of the anchor, and down to the ground at
  night): 80 tiles in 72 frames of 12,018, none of more than 3 tiles; 12 events, the largest
  (42 tiles over 30 frames at 112 s) on the way down through the cloud layer.

Looked at: sheets of stills of the flight on the ground (the coast, groves in blossom, a town, a
sea, mountains with snow, far ranges), of the tour by day and into the night, and of flights
held at 250,000 and 700,000 units (`--high`) by day and by night.

## The AMD GPU

Firefox on the AMD GPU at the weakest level (0.3 of the frame), 25 s by itself, each with one
part left out of a copy of the project (`build/planet/runs5.sh`, `runs6.sh`):

| Left out | GPU ms a frame |
| --- | --- |
| nothing | 27.0 |
| (the flyover, same run) | 19.6 |
| the clouds' shade on the trees | 26.9 |
| the rain's wet on the land | 26.7 |
| the clouds' shade on the land | 27.0 |
| the towns' and regions' fields on the land | 25.9 |

So the fragment stages' noise in three dimensions is not it. The second round is in
`build/planet/out-runs6.log`.

## The take

`work/videos-2026-11-16/voxel-planet/` (its README beside it).

## How it is looked at and measured

The flyover's tools, copied to `build/planet/` (not in git): `dev.mjs` plays the working tree's
project in the package's Godot without an image build, `probe.gd` saves frames, thumbnails and
frame times, `look.sh NAME "GAME ARGS"` makes a sheet of stills of a flight by itself,
`chain.sh SCRIPT` runs several browsers under one turn of the GPU's lock (the wait for it was a
quarter of an hour and more), `planet.mjs` computes the planet in JavaScript (a map, the shares
of sea and land, a place to start), `image.sh` builds the images and restarts the owner's server.
The planet's make-up by `planet.mjs shares`: sea 50 %, plain 41, hill 6, mountain 2.6, high
peaks 0.8; towns on a tenth of the land.
