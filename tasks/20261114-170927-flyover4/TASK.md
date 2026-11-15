# Voxel Flyover 4: smooth everywhere, mouse look, a pelican on a bicycle

- STATUS: OPEN
- PRIORITY: 300
- TAGS: godot,demo,0.1.7

Owner (2026-11-15): "I want to have a fable 5.2 agent work on improving the godot-voxel-flyover
image. I think it's on a great track but can use a lot of improvements. I also want to add a
pelican on a bicycle hanging under the surfing board, making it look like it's powering the jet
engines with it's bicycling somehow. The most important part is that it should be smooth, no sudden
changes/flickering in the graphics. When I run it on firefox it looks horrible but on Chrome with
unsafe webgpu flag that can target nvidia card it looks great, but needs some more love!" And: "It
should also be possible to change the view direction by moving the mouse around instead of it
being locked while having control. Also remove the numbers from the screen apart from the scoring
one (number of things hit)."

Branch `feature/flyover-4` (`work/flyover4`, from `v0.1.6`). Brief:
`work/briefs-2026-11-15/flyover4.md`. Version 3 is `tasks/20261114-081432-flyover-striking`.

## State (2026-11-16, morning)

Version 7 (the night of 15 to 16 November, below) is committed on `feature/flyover-4`; the game's
code is at `d6a657511`. The game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card
and on the integrated AMD GPU, and the source suite passes. The current take is
`work/videos-2026-11-15/voxel-flyover-7/take3.mp4` (its README beside it), and the demos page carries
its cut. The night's work is tracked in its own tasks: `tatr ls :flyover` (and `tatr ls -c
:flyover` for the closed ones), the research's fifteen steps among them (`tatr ls :research`).

Left (each in its task where it has one):

- The numbers on the NVIDIA card: another Chrome drew on that card for much of the night
  (the owner's, playing), so a run measured 43 to 60 a second by what else drew. With nothing
  else drawing the test gives the numbers below.
- The renderer's time goes by the number of things drawn: 320 to 380 draw calls a frame. The
  landmarks and the beacons' parts were made one mesh each for it; the flyers (some 150 parts)
  were not.
- The research's steps not done or partly done: erosion-like heights, the trees in the gusts,
  lakes and waterfalls, the high clouds, the sea's waves, forest structure, specular
  anti-aliasing, FSR on the weak adapter (`tatr ls :research`).
- Town layouts of their own for each kind; life on land.
- What Firefox's compositor shows is still unseen; Firefox's mouse turn still varies.
- `docs/gpu.md`'s two sentences for the next round of pins (see "The evening's round").

## Version 7 (the night of 2026-11-15/16)

Owner (19:40): mouth and tongue, the pelican's wings, towns from afar, landscape variety with
rarity, city variety, and to keep working "in the same style overnight"; then during the night
(by the integrator): the autopilot's camera, cultures and fantasy, a larger scale, the research's
steps, and after playing: hollow roofs, the beams, Space, flying higher, the help text, the
sunrise and sunset, and more flat land than mountains. Briefs:
`work/briefs-2026-11-15/flyover7.md` and the integrator's messages, quoted in each task.

What was done, by task (`tasks/20261115-*`): `mouth`, `wings`, `camera`, `towns-afar`,
`landscape` with `balance`, `cities`, `landmarks`, `life`, `roofs`, `beams`, `space`, `higher`,
`hint`, `sunset`, and two found by the measures: `first-draw` (a frame of 160 to 220 ms when a
thermal was first drawn) and `handover` (the clouds changed at once as the sun handed over to
the moon).

### Numbers

The game's test (30 s by itself from 09:00), 1920 by 1080 frames:

| | Version 6 | Version 7 (`d6a657511`) |
| --- | --- | --- |
| NVIDIA RTX 5070, Chrome 156 | 60.0 a second, GPU 5.7 ms | 59.6 a second, GPU 6.7 ms, median 17.0 ms, p99 20.4, max 35.7 |
| NVIDIA RTX 5070, Firefox 159 | 58.9, GPU 5.8 ms | 57.2, GPU 7.2 ms, median 17.2 ms, p99 22.3 (one frame of 114 ms) |
| AMD integrated, Firefox 159 | 29.9, median 33.4 ms, p99 37.3 | 29.5, GPU 21.6 ms, median 33.2 ms, p99 40.0 (one frame of 131 ms) |
| AMD integrated, Chrome 156 | 29.8, median 33.4 ms, p99 36.9 | 29.9, GPU 19.9 ms, median 33.3 ms, p99 37.1 |

Sudden changes over the fixed flight: 17 tiles in 14 frames, none over two at once (version 6: 70 in 55).

## Version 6 (2026-11-15, from 18:10): the owner's fixes

Owner (18:10): "Fixes: 1) make the city more realistic, there should not be any trees growing out
of buildings or super close by. Each building should have at least 4 levels. 2) the pelicans
head is going through a pole right now - fix it 3) make the pelican hold the steering handles of
the bicycle with his wings 4) fix the tongue of the corgi, it looks detached right now 5) make
the corgis body more skinny 6) when its snowing or raining, it should be heading downwards, and
the drops are too rectangular 7) add clouds and mist 8) use FABLE 9) this game is now the TOP
PRIORITY". Brief: `work/briefs-2026-11-15/flyover6.md`.

How each was looked at: a copy of the game whose camera stands at a given place in the flyer's
frame (`studio.py`, `studio.sh` in `work/videos-2026-11-15/voxel-flyover-4/tools/`), stills a
second apart at a fixed 60 steps a second, so at different phases of the pedals; the game's own
five views (near, beside, the pelican's, high and far, ahead); and the take.

1. **Towns.** A town is blocks of four lots by five between avenues (every fifth line of lots
   one way, every sixth the other), which are asphalt with a broken middle line. A building
   stands on most lots: none on an avenue, on a lot that tilts more than 9 units, at a town's
   thin edge, or on the one lot in ten that is a lawn. It has 4 to 20 storeys of 3 units (before:
   from under one storey up, by the town's share), a footprint of its own in each direction,
   shop fronts on its ground floor, a line between storeys, a row of windows a storey, a
   parapet, and a roof with a rim and a stair head. Its base goes 8 units into the ground, so
   none shows a gap on a slope. No tree stands where a town or a margin around it is
   (`town_near`): before, trees thinned with the town's share and stood in lots. The flight
   and the camera look ahead for the same roofs (`terrain.gd`). Looked at: a dive into a town
   (`dive.py`) and a flight at cloud height over one, stills from above and beside.
2. **The pole through the pelican's head** was the bicycle's front hanger: one rod from the
   head tube's top to the board, up the bicycle's middle, where the bill and the front of the
   head are. Two rods now go from the head tube to the board's sides and pass the head 0.4 of
   the rig's units to either side. Looked at from the front left at four phases, and with the
   handlebar turned each way.
3. **The wings hold the grips.** Each wing is an upper wing from shoulder to elbow and a
   forearm from elbow to grip, laid each frame as the legs are, with its black tip closed
   around the grip and the flight feathers trailing from the elbow. The handlebar, its stem,
   the fork and the front wheel turn in the head tube with the flight's turn, by 20 degrees at
   the most, and the wings follow. Looked at as above, turned each way.
4. **The tongue** was a flat disc under the front of the muzzle, in the air. The mouth is now
   open: a lower jaw under the muzzle, dark between them, and a tongue that lies in the jaw
   from the back of the mouth and hangs over its front. Looked at from the front left at 40
   degrees of view, and in the game's views.
5. **The corgi's body** is 0.8 wide where it was 1.15 (and 0.86 high for 1.1), its chest and
   rump as much slimmer, its legs closer together; as long as before, the legs as short.
6. **Rain and snow** were streaks painted on two tubes around the camera, which slid along the
   tubes' sides. They are 9,000 cards (3,600 on a weak adapter) in a box of air 44 by 30 by 44
   around the camera, each facing it: a drop a thin streak along its way, soft across and
   toward its ends, a flake a soft round dot, near ones large and far ones small; between
   seasons some are drops and some flakes. A drop falls 22 units a second and a flake 2.6;
   the wind carries them and the flight slants them back by no more than half of their fall,
   so on a level view they come down wherever they are on the screen. Measured with the flight
   and the camera held still, from the pixels that went dark in the later of two frames and
   those that went bright (`fallcheck.mjs`): rain 34 pixels down and 2 right in one frame (4,660 pixels line up at that shift, 171 at the opposite one); snow 17 pixels down and none sideways in six frames (8,191 against 2,703).
7. **Clouds and mist.** Low clouds (`cloud.gdshader`): for each cell of 240 units of a grid
   that drifts with the wind, where a noise of the cell's number says so, nine soft balls, flat
   under, 100 to 160 units over the sea and never less than 50 over the ground below, under
   the board's ceiling of 190. A ball is soft toward its rim, draws in within 32 units of the
   camera, and the air whitens as the camera comes into one (`in_cloud` in `main.gd` computes
   the same balls), so a cloud is flown through without a pop. Two things popped on the
   way and were found by the measures: the clusters were drawn in the order of a grid that
   stepped with the flight, so where one soft ball showed through another the picture changed
   at each step (each cluster is now always a cell of its own place in the grid, and only a
   far one changes its cell); and a ball's far side went at once as the camera passed its near
   one (a ball the camera comes up to now thins out whole). Mist is the same balls, flat,
   on the sea and on ground under 14 units over it, thin by day and thick at dawn, when the
   haze over the sea thickens as well (the existing height fog, 0.006 to 0.022). Cost on the
   AMD GPU at its level: clouds 1.3 ms, mist 1.1; the clouds' balls have fewer faces for it
   and that level leaves the banks of mist out: 20.4 ms a frame, against 20.1 before.
   The rate it holds there now has slack: it goes from 30 to 20 a second when the GPU's mean
   is over 27 ms and back when it is under 22.

A close view was off its middle: the camera follows the flyer's place a fifth of a second
late, which at 40 units a second is 8 units, more than a close view's distance. The lag now
shrinks with the square of the zoom.

### Numbers

The game's test (30 s by itself from 09:00), 1920 by 1080 frames:

| | The evening's round | Version 6 (`4627d207e`) |
| --- | --- | --- |
| NVIDIA RTX 5070, Chrome 156 | 60.0 a second, GPU 5.7 ms (quiet) | 60.0 a second, GPU 5.7 ms, median 16.2 ms, p99 20.0 |
| NVIDIA RTX 5070, Firefox 159 | 58.9, GPU 5.9 ms (quiet) | 58.9, GPU 5.8 ms, median 17.0 ms, p99 20.1 |
| AMD integrated, Firefox 159 | 30.0, median 33.3 ms, p99 37.1 | 29.9, GPU 19.8 ms, median 33.4 ms, p99 37.3, max 49.2, no hitch |
| AMD integrated, Chrome 156 | 29.8, median 33.4 ms, p99 36.5 | 29.8, GPU 19.4 ms, median 33.4 ms, p99 36.9, max 53.9, no hitch |

Sudden changes over the fixed flight (spikes): 70 tiles in 55 frames and 12 events, against 77 in 62 and 10 before the round, and 28 frames whose mean brightness steps, as before (measured a commit earlier, before a ball thinned whole; while the air whitened at once in a cloud, 61 such frames).

## The evening's round (2026-11-15)

Integrator (16:40): buildings must not be flown through; an even 30 a second on the AMD GPU at
the clean look, and at most 30 minutes on Chrome there; the shadows' crawl and the fur's edges;
more variety and interaction; a take and the demos page.

### Buildings

The flight looked 80 units ahead in a straight line at five places 20 apart, and a lot is 16
wide. It now looks along the turn it is in at twelve places of the next 1.5 s, and besides the
height it steers for takes the climb that clears every roof on the way in the time the board
needs to reach it. The camera's lift takes the roofs for ground, looks around itself as well as
ahead, and rises three times as fast as it settles. Measured by a copy of the game that starts
beside a town, dives at full speed and reverses its turn every 2.6 s, for 45 s (`dive.py`,
`dive2.py` in `work/videos-2026-11-15/voxel-flyover-4/tools/`): the board was never inside a building before or after, and its
least height over a lot's roof went from 3.2 to 10.0 units; a camera orbiting the flyer zoomed
out was inside a building in 10 of 2,680 frames before, in none after. A wall that pushes the
board aside was written and removed: in those flights it never acted.

### The AMD GPU

| | Before (`f22007958`) | After |
| --- | --- | --- |
| AMD integrated, Firefox 159 | 20.2 a second at level 5, frames 50 ms apart; 10 s at 5 a second before it settles | 30.0 at level 6, median 33.3 ms, p99 37.1, max 48.9, no hitch; settles in 3.5 s |
| AMD integrated, Chrome 156 | not started | 29.8, median 33.4 ms, p99 36.5, max 53.0, no hitch |
| NVIDIA RTX 5070, Chrome 156 | 60.0, GPU 5.5 ms | 60.0, GPU 5.7 ms, median 16.2 ms, p99 19.9 |
| NVIDIA RTX 5070, Firefox 159 | 59.0, GPU 5.6 ms | 58.9, GPU 5.9 ms, median 17.0 ms, p99 18.9 |

- At level 5 without a cap Firefox drew a frame every 44.5 ms whether the GPU took 19 or 23 ms:
  the provider's empty submissions, which make Firefox settle a completion, came 2, 5, 10, 20
  and 40 ms after it, so a frame done at 23 ms was seen at 40. `host/gpu/worker.mjs` now makes
  one every 3 ms up to 100: the same frame shows at 33 ms.
- What a part costs there, by leaving it out at level 5 (GPU 23.1 ms): the second grid of trees
  3.4, the shadows 2, glow 1.4, a scene at 0.4 instead of 0.5 3.9; the sky's light, the sea, the
  coats and simpler crowns under 0.6 each. A seventh level draws the scene at 0.4: GPU 19 to
  20 ms, and the game holds 30 a second (it holds that rate while the GPU's mean is under 24 ms).
- The game counted 30 frames before its first window of 20; it now counts 8, and a window ends
  after 1.5 s of frames at the latest.
- Chrome on the AMD adapter: `--use-webgpu-power-preference=force-low-power` leaves the page's
  GPU inactive on Xvfb with ANGLE on Vulkan. With `VK_DRIVER_FILES` (and `VK_ICD_FILENAMES`)
  naming `/usr/share/vulkan/icd.d/radeon_icd.x86_64.json` alone in Chrome's environment, the
  adapter is `amd rdna-2` and the game runs as above. Five minutes of the thirty.

### Shadows and fur: measured, not changed

- With the flight held in place at 16:30 (`crawl.sh`), three consecutive frames reverse 0.046
  to 0.058 (shimmer) in the views the shadows fill, 0.012 with the sun held still between steps of
  0.1 or 0.5 s, 0.036 with Godot's soft filter at its high quality, 0.033 with that and a wider
  blur. So the sun's motion does make the edges crawl. Over the fixed flight (29 bursts at
  16:30 to 17:30) the shimmer is 1.231 with the sun moving and 1.231 with it stepped: the flight
  itself moves every edge, and a step of 0.1 s would jump a tower's shadow by some 3 pixels ten
  times a second. Nothing was changed.
- The coats' hairs with alpha to coverage (four samples) instead of a discard: the same frame
  looks the same, and three consecutive frames reverse 6.464 against 6.485. The steps along a
  coat's outline are its shells. Removed.

### Variety

- **Marsh**: low wet ground by the sea has few trees, reeds, and pools that mirror the sky and
  carry ice in winter.
- **Savanna** between the desert and the meadows: grass, gold for most of the year, green in
  spring and after rain, with a few flat-headed trees.
- **Sea ice**: in winter the seas of the cold lands carry floes that drift with the wind.
- **The desert's veins are lava**, and glow by day.
- **What ties things together**: a shower leaves the ground wet behind it for 45 s, and in
  spring more flowers stand there; a lit beacon warms the ground 90 units around it, where the
  snow and the sea's ice draw back and flowers stand; in winter a town's lamps are each lot's
  own colour and brighter; in rain or snow the flock closes up and flies low.
- Cost: the GPU's 5.5 ms a frame on the NVIDIA card became 5.7 (Chrome), and on the AMD GPU at
  level 6 19.2 became 20.1.
- Sudden changes over the fixed flight (spikes, as below): 77 tiles in 62 frames and 10 events, against 92 in 74 and 12 before the round.

## Version 5 (2026-11-15, afternoon)

Owner (14:55): "This is turning into the main feature of this whole project [...] 1. I want zoom
in/out, and the camera to be centered better instead of a bit behind the character. 2: More
shaders ! 3: On firefox that can't use my nvidia, it looks incredibly hacky/laggy, not sure what
to do about that I prefer if it's slow over hacky or like lower resolution. Not sure. 4: Make the
flying a bit more interesting from a game mechanics perspective, but keep the game itself
intentionally pointless. 5: Add more variations, ideally interactions that interact with each
other, seasons, cities, deserts, etc. [...] 6: Just fix up the characters... what is that dog
tongue? And what is the red circle thing that comes out of it's neck?.. Go."

Brief: `work/briefs-2026-11-15/flyover5.md`.

### The weak adapter

Reproduced as the brief says, in Firefox pinned to the AMD GPU
(`MESA_VK_DEVICE_SELECT='1002:13c0!'`), with version 4's game: **5.0 frames a second**, the GPU
124 ms a frame, and the frames exactly 200 ms apart (median 200.1, p99 201.3, max 216.9): Firefox
learns that a frame is done on a 100 ms timer once the provider's own polls (at 2 to 40 ms) are
past, so a frame of 41 to 100 ms shows at 100 and one of 101 to 200 at 200. That is the lag.
What read as hacky there was also in the game: the trees' rings and the beacons' crystals faded
by a screen-door of pixels, which at five frames a second is a crawling grain.

What costs on that adapter, by leaving parts out at 0.4 of the scene's size and one sample: the
trees 28 ms of 55 (some 4 million vertices through a vertex stage that reads the ground), the
shadows 10, the land 6, the sky's light for the scene 4, the rest 5. The size of the picture is
the least of it, so the ladder cuts the fixed work and keeps the picture at half size or more:

| Level | Scene's size | Samples | Fog shafts, AO | Shadows | Coat's shells | Trees' grids | Crowns near by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 1.0 | 4 | both | 4 cascades to 420, 4096 | 18 | 4, painted from 540 | 12 rings |
| 1 | 0.8 | 4 | AO | 4 cascades to 420 | 14 | 4 | 12 |
| 2 | 0.7 | 1, FXAA | none | 2 cascades to 300, 2048, sky light 64 | 10 | 3, painted from 360 | 12 |
| 3 | 0.6 | 1, FXAA | none | 1 to 160 | 8 | 2, painted from 180 | 5 |
| 4 | 0.55 | 1, FXAA | none | 1 to 120 | 6 | 2 | 5 |
| 5 | 0.5 | 1, FXAA | none | 1 to 90 | 5 | 2 | 5 |

The game starts at level 0 and measures the GPU's time over 20 frames (Godot's timer; where a
browser has none, the time between frames stands in): over 14 ms it goes down, by up to four
levels at once when far over, and after a minute well under it goes up one. Below the last level
it holds an even rate (30, 20 or 12 a second) by what the adapter manages. So the choice is by
what is measured, not by the browser. WebGPU has one or four samples a pixel and no two: Godot's
2x there draws nothing (an invalid bind group, a black frame at 59 a second), which the test's
count of the frame's colours catches.

The screen-door is gone at every level: where two grids of trees overlap, the coarser tree comes
inside the finer one and grows to its size, and the finer one then draws back inside it; the last
grid's trees and the shadows' sink into the ground where the land paints their crowns; a tree or
a crystal the camera flies into draws in.

### Numbers on both adapters

The game's test (30 s by itself from 09:00), 1920 by 1080 frames, a quiet machine:

| | Version 4 (`bf8903e34`) | Version 5 (`ae9e67dc4`) |
| --- | --- | --- |
| NVIDIA RTX 5070, Chrome 156 | 59.3 to 60.0 frames a second, GPU 5.2 ms | 60.0 frames a second, GPU 5.5 ms (16.5 ms a frame at the median, p99 20.1) |
| NVIDIA RTX 5070, Firefox 159 | 58.6 to 59.0, GPU 5.2 to 5.5 ms | 59.0, GPU 5.6 ms (17.0, p99 18.9) |
| AMD integrated, Firefox 159 | 5.0, GPU 124 ms, frames 200 ms apart (median 200.1, p99 201.3, max 216.9) | 20.2 at the ladder's last level, GPU 22.4 ms, frames 50 ms apart (median 49.9, p99 53.6, max 54.4, none over twice the median) |
| AMD integrated, Chrome | not started (see State) | not started |

Sudden changes over the fixed flight (spikes, as above) with the new world: 92 tiles in 74 frames,
against version 4's 78 in 76 and version 3's 350 in 117; none over four tiles.

### What else changed

- **Camera**: it looks at the flyer from straight behind (the view's aim is the flyer, not a
  point 25 units ahead of it), and the wheel or Z and X zoom between 0.45 and 3.2 of the view's
  distance, eased; let go, the zoom comes back with the view.
- **Characters**: the red circle was the cape's collar, a torus wider than the neck's fur, which
  stood out of it as a ring: gone, for a gold clasp at the throat. The tongue was a flat pink
  ball at the side of the muzzle that flapped 19 times a second: now a tip under a dark mouth
  line, that moves a little.
- **Flying**: a dive gives speed and a climb takes it (through the same easing, so it is kept
  for a while); the wind, which is the clouds' drift, gives a little at the back; low over the
  sea the board skims 14 units a second faster in its own spray; a slope that faces the wind
  lifts it, and a thermal over a town by day; a lit beacon gives a push that wears off; a flock
  of sixteen birds falls in behind the board when it passes and their company carries it a
  little faster for a quarter of a minute. Streaks of air show at speed. No goal, no failure;
  the one number is still the beacons lit.
- **The world**: a year of three days, whose seasons are three shares the shaders are told:
  more groves blossom in spring and more turn in autumn, each tree in its own time; in winter
  the broad crowns are bare, snow comes 52 units down the slopes and lies on crowns and roofs,
  and the rain is snow. Under the deep of a cloud it rains: the land is darker and glossier, the
  sea pocked, streaks fall around the camera, and with the sun out a rainbow stands opposite it.
  Towns stand on some low plains: a building for each lot of 16 units, taller toward the middle,
  with windows that are lit at night and streets with lamps; around them fields in strips with
  hedges, green in spring and gold by late summer. The desert's sand lies in rippled dunes; at
  night a shooting star crosses every six seconds. The flyer's wash bends the crowns it passes
  low over. All of it is a function of the place and the clock, as before.
- **Shaders added**: `city`, `rain`, `thermal`, `speed`, `bird` (with version 4's `flame` and
  `drive`), and the seasons, fields, dunes, wet, rainbow and shooting stars in the existing ones.

## How it is measured

All on this machine's RTX 5070 under `gpu@0`, Chrome 156 and the installed Firefox 159, on a
private Xvfb. The tools are `work/videos-2026-11-15/voxel-flyover-4/tools/` (not in git):
`dev.mjs` plays the working tree's project in the package's Godot without an image build (the
page composes `voxel-flyover` with `curl`, and fetches the project as a tar from the test server),
`probe.gd` is added to it as an autoload and saves frames and every frame's time, and
`analyze.mjs` computes the measures.

- **The fixed flight**: `--autopilot 60 --day 9`, a minute by itself from 09:00 of the game's day
  to 21:00, through all the camera's views, eight beacons, sunset and the first of the night.
- **Frame times**: the microseconds between `_process` calls over that flight, without its first
  two frames (Godot's start): median, 99th percentile, maximum, and the frames over twice the
  median. The game prints the same of its steady frames (`FLYOVER frame times`), and its test
  bounds the last.
- **Flicker**, on the luma of three consecutive frames a, b, c: a pixel reverses when it goes one
  way and comes back, by r = min(|b-a|, |c-b|). A moving edge passes a pixel once and does not
  reverse; a pixel that flickers, shimmers or pops for a frame does. *Shimmer* is the mean of r
  over all pixels (in 1/255 of full scale), *flick* the pixels with r over 12, per mille. Fine
  detail that moves fast reverses too, so the measure follows the movement on screen (about a
  fifth of the mean frame difference): it compares versions of one flight and is no absolute.
- **Bursts**: the flight at Godot's `--fixed-fps 60`, where the game's frames are the same
  whatever the machine's load or the browser, with three consecutive frames read back every two
  seconds (29 triples). **Slow bursts**: 40 s of it at `--fixed-fps 240`, a quarter of a frame's
  movement between frames, where what moves across the pixels hardly reverses and what flickers
  of itself still does (20 triples).
- **Jumps**: the flight at the fixed step with every frame read back and shrunk to 120 by 67, in
  tiles of 8 by 8 (128 pixels of the frame). A *spike* is a tile whose change in one frame is
  over 2.5 times that of the frames before and after and over 4/255: something there appeared,
  vanished or leapt. An *event* is a run of frames in which 8 tiles or more change over three
  times their median of the 30 frames around: a spike, or a movement that sets in. The frames
  around each spike were then read back whole and looked at; that is how the causes below were
  found.
- A capture of Chrome's screen at 60 frames a second repeats and drops frames when the machine is
  loaded (795 of 3,300 at a load of 5), so the measures above are taken on the game's own frames.

## What popped or flickered, and what was done

Each was seen on the frames named, in version 3 as shipped unless it says otherwise.

| What | Where it was seen | Cause | Fix |
| --- | --- | --- | --- |
| A band of light came or went on a hillside in one frame, at each step of the grids and when a beacon was lit; at night whole ranges were lit in broad bands that differed from grid to grid | spikes of 13 to 25 tiles at 6.8, 39.2, 54.8 and 57.2 s, of 2 to 7 at 36.0 and 36.9 s | In `pulse_light` a local named `reach` took the value of the ground's uniform `reach`, declared after it in another include: a ring stood at the grid's reach (180, 756 or 2,292 units) and was as wide, instead of running out at 75 units a second | Renamed. A ring also grows out of nothing in half a second, is gone before the next sets off, and fades with its beacon's distance (eight beacons, where the four nearest were shown and changed places at once); it leaves a glow behind its front |
| The fur of the corgi's legs flickered between long and short | spikes of 2 to 5 tiles a few frames apart, all flight | Godot hands a vertex stage the normal scaled as its part where the part's scale is even, of length one where it is not; a leg's scale changes as the corgi crouches and crossed from one to the other | `normalize(NORMAL)` in `fur.gdshader` |
| A bright dash between the jets every third frame, and the wakes' pattern slipping | spikes 3 frames apart, most at night | A place was added to the wakes at the board's own, so the first stretch had no length and no direction for a frame, and places were 1.2 to 1.7 units apart | Places exactly 1.2 apart; the first stretch takes its direction from the place after |
| The camera set off at once at each change of view | an event at every 10 s; in slow bursts the triple at 30.0 s had 5.15 of shimmer, the others 0.05 to 0.7 | One exponential approach: full speed in the first frame | The view follows a point that follows the next view |
| The camera rose and fell with the ground under it | events at 16.4 and 16.8 s | A hard floor 6 units over the ground at the camera's place | The highest ground under and up to 45 units ahead lifts it, by degrees |
| A turn of the view cut through the flyer (new with mouse look) | the look test's frames | The camera's place approached its goal along a straight line | It follows the flyer's place and heading a little late, and turns about it exactly |
| A beacon changed colour and brightness at once when lit | spikes at each lighting | The beacon was rebuilt | It takes its light over about a second |
| A beacon's chime was made as it was lit | by reading: 22,050 samples in a script's loop, in the frame | | The six notes are made before the flight |
| A beacon's shaft or crystal, or a tree, filled the screen for some frames as the camera flew through | events at 23 s (capture), 55.3 s | | They thin out before the camera |
| Far shafts and veins flickered as lines thinner than a pixel; the wakes seen on edge were bright lines | heat of the bursts | | A width of a pixel or a few, fainter in proportion; the wake fades as it turns its edge |
| The ground, sea, crowns and fur shimmered where their detail was finer than a pixel | slow bursts | Noise, flowers, ripples, clumps and hairs sampled once a pixel | Each fades to its mean by the size of the pixel on its surface |
| The clouds' shade leapt at dusk | by reading | The light's direction turns from the sun to the moon at once | The shade fades out before, with the light's height |
| The cape's and feathers' flutter raced when the speed changed | by reading | `TIME * speed` in the shader | The game counts the phase |
| A far mountain's shadow came at once | by reading (not seen on the flight) | Only the two finer grids cast shadows | All three do |
| A bicycle wheel's disc flashed white once a turn (new) | take 2's frames | A flat, smooth face turning through the sun's reflection | The discs are rough |
| The painted crowns past the last trees were squares | stills | A crown wider than its plot was cut off at the plot's edge | The nearest of nine plots' crowns |

Not a fault of the platform: a material's uniform set every frame reaches the screen every frame
(a patch whose brightness a uniform stepped, read back for 220 frames).

## Measurements

Version 3 is `v0.1.6`'s game, each measure on its own flight and camera; "now" is `dcd36b2db`.
Chrome and Firefox draw the same frames at a fixed step (mean difference of 87 frames 0.016/255,
and the same spikes and events to the tile), so one row serves both unless it says so.

| Measure | Version 3 | Now |
| --- | --- | --- |
| Spikes over the flight (tiles, frames with one) | 350 in 117 | 78 in 76, two of them of two tiles, none of more |
| Events of 8 tiles or more | 16 | 9: the changes of view at 30, 40 and 50 s (4), two turns toward a beacon, one at 52.6 s where a ring sets off close to the camera, and the flight through a beacon at 55 s (2) |
| Tile jumps | 5,902 in 722 frames | 3,022 in 686 |
| Slow bursts: shimmer of 20 triples, the worst triple, flick | 0.431, 2.91, 6.5 per mille | 0.208, 0.50, 2.5 per mille |
| Bursts: shimmer of 29 triples, flick | 1.273, 23.3 per mille (movement 5.43) | 1.129, 20.9 per mille (movement 5.07) |
| Bursts on one flight and camera (this version's), with version 3's shaders and the new | 1.317, 24.5 per mille | 1.161, 21.9 per mille (before the last fixes) |
| GPU time a frame, Godot's measure | 5.2 to 5.5 ms | 5.1 to 5.5 ms |
| Frame times over the flight, Chrome | load 1.5: median 16.5 ms, p99 20.0, max 38.6, 2 of 3,598 over twice the median | load 7, while its screen was captured: 18.9, 36.5, 59.7, 18 of 3,126 |
| Frame times over the flight, Firefox | load 1.2: 17.0, 19.9, 37.6, 4 of 3,541 | load 7: 17.0, 24.5, 47.9, 11 of 3,470 |
| The test's flight (30 s), Chrome | 60.0 frames a second (version 3's task) | load 1.5 (`dc773fcfe`): 59.9, median 16.7 ms, p99 20.9, max 31.1, no hitch; load 11: 52.8 to 54.6 |
| The test's flight, Firefox | 59.0 | load 1.5 (`dc773fcfe`): 59.0, 17.0, 20.9, 46.2, 4 hitches; load 11: 52.7 to 53.6 |

The GPU's time a frame is unchanged with the pelican (some 40 more draws), the third grid's
shadows and the nine-plot crowns. From 03:00 the machine's load was 7 to 14 (two other agents'
Chrome renderers at 400% each), so this version's frame times on a quiet machine are those of
its first commit alone; the rate follows the load, as version 3's did (its task: 25.9 frames a
second at a load of 8). The shimmer of the plain bursts follows the movement on screen and says
little; the slow bursts and the spikes are the measures of what was fixed.

## Firefox

What was found, in the order it was looked for:

- **Godot draws the same picture.** At a fixed step the frames the game reads back from its own
  render target are the same in Chrome and Firefox: mean difference 0.000 to 0.021 of 255 over
  the triples, 0.34 per mille of pixels over 12 at most. No effect the game uses is missing in
  Firefox (it uses SSAO, glow, volumetric fog and shadows, none of which needs the texture format
  tiers).
- **As evenly timed.** Frame times over the fixed flight: Chrome median 16.5 ms, p99 20.0, max
  38.6; Firefox 17.0, 19.9, 37.6. Same adapter (the NVIDIA card through Vulkan in both).
- **So what differs is how Firefox shows the frames, and that could not be seen here.** On Xvfb
  Firefox composites in software and shows no WebGPU canvas at all (docs/gpu.md). Forced to
  composite with OpenGL (`gfx.webrender.all`, `gfx.webrender.software=false`; Mesa's llvmpipe on
  Xvfb) it shows the canvas, and then:
  - the game's picture had red and blue exchanged (a blue corgi under an orange sky), in the
    window and in Playwright's screenshot alike;
  - in a page of bare canvases cleared to red and blue, an `rgba8unorm` canvas showed right, a
    `bgra8unorm` one (Firefox's preferred format, which `host/gpu` configures) showed nothing at
    200 by 100 and showed exchanged or right at 1920 by 1080 from one run to the next; with
    Firefox's own defaults an `rgba8unorm` canvas crashed the browser;
  - the window showed 109 different frames in 20 s while the game drew 52 a second.
  None of this is the owner's configuration (a GNOME X11 session whose Firefox composites on the
  NVIDIA card), so it says where to look and not what the owner sees. A private display the GPU
  drives was tried with a headless gnome-shell and its Xwayland and given up: it started the
  desktop's services and watched the owner's login session, and its Xwayland never answered.
- Not looked into: how Firefox hands a WebGPU canvas's frames to its compositor on Linux. If it
  reads each frame back and uploads it again, its screen would show fewer and less even frames
  than the game draws, whatever the game does.

Nothing was changed in `host/gpu` for it: a choice of canvas format made by what was seen on
llvmpipe would be a guess about the owner's screen. The game's own share is done for both
browsers alike: less of what flickers when frames are shown unevenly.

## Mouse look and the screen

The game asks for the pointer from its start; the page gives it at a person's click (a trusted
event), which also takes the board, and takes it back at Escape, which also lets go of the board
(the page keeps that key while it holds the pointer). Enter still takes the board without the
pointer, and a click then gives it. The mouse turns the view around the flyer (0.0035 rad a
pixel, any way round, 0.5 rad up and 1.0 down), eased over a few frames; let go, the view comes
back the short way round. No Control takes the motion: the HUD's are Labels, whose mouse filter is
ignore, and the game reads the motion in `_input`. The test clicks, waits for
`document.pointerLockElement`, moves the mouse 300 pixels and reads the view the game prints at Q:
60 degrees in Chrome, 58 in Firefox. Once, in Firefox on a loaded machine, it read 92 degrees
and 9 up: more motion than the mouse made. The game now leaves the motion of the first quarter
second after a capture, and lets no one motion turn the view more than 150 pixels' worth, so a
pointer's way to where it was captured cannot throw the view. That was not the cause: with it,
and a second between the capture and the moves, Firefox read 83 degrees in one run of two at a
load of 13 and 59 in the other, Chrome 60 in both. So on a loaded machine Firefox reports more
relative motion than Playwright's moves make; whether a person's mouse does the same there is not
known, and the test accepts 30 to 150 degrees. The screen keeps the title, the keys' hint (for 12 s after the
board changes hands) and one number, the beacons lit, beside a beacon's crystal.

## The pelican

`pelican.gd`, of Godot's primitive meshes like the corgi: a white bird in a cyclist's red cap with
a long bill and its pouch, on a yellow bicycle with disc wheels that hangs from the board by its
head tube and rear axle. A chain runs from the chainring to a sprocket on a shaft between the two
engines, and a fan turns in each intake; chain, shaft, fans and wheels turn by the cranks' one
angle. The cranks turn 1.05 times a second at cruise and faster with the speed; the flames
lengthen and the nozzles brighten with each stroke, a ring of brighter gas runs down each flame
and a pulse down each wake. Its legs are laid from hip to knee to pedal each frame; its feathers
are the fur's shells, and its flight feathers, tail and crest are strips of the cape's cloth.
The camera's third view, of five, is the pelican's.
