# Voxel Flyover: smooth on the way to orbit, and more variety in the world

- STATUS: OPEN
- PRIORITY: 300
- TAGS: godot,demo,planet

The owner (2026-11-18, through the coordinator): "For planet - I want an opus5.5 agent to keep
working on it, mostly I want things to be more smooth in graphics transition especially when going
out to orbit. But in general I want to add more variety to the world." The coordinator's order:
first every visible switch on the tour made a blend (recorded, looked at frame by frame, hitches
measured as frames over 2x the median in the climb and the descent, rates kept); then variety:
biomes and their transitions, landforms, towns and cultures, landmarks worth flying to, seas and
islands, fantasy places; each addition's cost measured.

## State (2026-11-18)

In progress. Found and fixed: the near sea's patches that changed at each step of grid 2 (the
climb's spikes gone). Added: mesa country, atolls, salt flats, flower fields, red sandstone, spires
of an old world, sky lanterns. The four tests pass in Chrome and Firefox on the final image. Open:
Firefox's stall at the start (Tests, below).

## The tour, frame by frame

How: `build/planet/mktour.py` makes a copy of the game that prints each switch that goes with the
height, with its frame (a grid shown or hidden, a grid's ground drawn anew, what lives near the
ground and the flock shown or hidden, the height taken off, the chart's anchor moved, the tour's
phase, and the height each second). That copy flew the tour (`--autopilot 175 --day 9 --tour 2
--top 250000`) at a fixed 60 steps a second (`dev.mjs --godot "--fixed-fps 60"`), every frame read
back as a thumbnail of 120 by 67 (probe.gd's `--thumbs`) and every third second whole (`--still
3`): 10,500 frames, 24 minutes on the GPU. `analyze.mjs thumbs` finds the tiles of 8 by 8 that
jump in one frame against the frames around them; `strip.mjs` draws the frames around one and their
differences.

The tour's switches by height: grid 0 hidden at 450 units, grid 1 at 1,800, the flock at 2,600,
grid 2 at 7,200, what lives near the ground at 9,000, grid 3 at 28,800, grid 4 at 115,000; the
height taken off steps every 8,192 units from 22,000; the chart's anchor moves from 64,000 (every
1.4 s while the tour circles at 260,000); the far grids' grounds are drawn anew up to every frame
high up. Each fades or hands over by design (the grids' heights by 150 to 300 of their cells, what
lives near the ground by its height over it, the clouds from 1,400 to 4,200, the landmarks from
3,000 to 5,500), and none of these frames showed a jump.

What did: spikes at 35.0, 36.0 and 36.9 s in the climb (1,000 to 1,400 units), 109 to 112 s and
123 to 127 s in the descent, each on the frame after grid 2 stepped (frames 2159, 2213, 7505): a
straight line near the horizon. A first reading took it for a one-frame flash of the grid's
texture (which wraps around the chart and is drawn anew a frame after a step), and gave each
texture a step's margin; the same tour flown again with the margin had the same spikes on the
same frames, and the difference images say why: the line is in the difference of the frame from
the one before and not of the next from it, so it is a change that stays, not a flash. The margin
was taken out again.

What it is: the near sea, a plane 8,000 units across that follows the flyer, reads the ground
(for its depth, so its colour, foam and ice) from grids 1 and 2, whose textures reach some 2,300
units from the flyer; past that it read them wrapped around, the depth of other places. A still of
the same second shows white patches with straight edges on the far water, and at each step of
grid 2 their pattern changed: the line. And over 7,200 units, where grid 2 is hidden and its
texture no longer drawn, the near sea still read it. Fixed: past 2,150 units the sea reads grid
3's ground (which reaches 9,000), blended in from 1,900; and the near sea is shown exactly while
grid 2 is, since it stands in for the grids that draw no sea, and grid 3 draws it in grid 2's
square once grid 2 is hidden. Besides, the near sea did not take the air's blue from high up that
the far grids' sea takes, nor the polar ice: it takes both now. The other large changes in the
tour were the camera's views gliding into one another (at 44, 55, 112, 123, 150 and 162 s, the 68-s
round), and the pelican's spokes strobing at a fixed 60 steps a second.

The climb flown again with the fix and the variety below (`t-fix3`: the tour's first 45 s, 2,700
frames at a fixed 60 steps, the same flight frame for frame): `analyze.mjs thumbs` finds no spike
where the old climb had 11 tiles in 6 frames (35.0, 36.0, 36.9 s), and the same three events of 8
tiles or more on the same frames as before (40.8, 44.1, 44.5 s: the camera's glides). The stills
of its 36th second, before and after (`t-fix1`, `t-fix4`): the white blocks with straight edges on
the far water are gone, the rest of the frame is the same. The descent's spikes had the same cause
and were not flown again.

The hand-over: the flyover test failed once with the nose 1° up after the mouse's 240 pixels,
the board in a bank of -61° when it was taken (in a bank the pulled stick turns the board). A
board taken from the corgi now levels its wings in its first second in the hand, unless the hand
rolls it.



## Variety

- **Mesa country** (`mesa_on`, `desert_of`, terrain.gdshaderinc and terrain.gd): where a field of
  4.7 thousand units is high in a warm dry region and the land is desert, the land is a level
  desert floor out of which mesas and buttes stand, one or two tiers of 34 units over cliffs, which
  the rivers cut into canyons. A first version followed the regional fields alone: 11.5% of the
  land, but the first look (`looks.sh`, probe.gd's `--look`) found it under green farmland, since
  the local climate there was cool and wet. Now the ground shader computes the climate first and
  hands it to `terrain_on` (it computed both for the same texel anyway), and terrain.gd computes
  the local climate only where the cached regional fields allow mesas: 3.7% of the land within
  40,000 units, the nearest at (-500, 2500). Looked at from 110 units: a flat-topped mesa with
  banded red cliffs, a white salt flat by a pool, a butte standing out of the sand.
- **Red sandstone**: the desert's rock in red and paler bands by the height, their mean where a
  band is finer than a pixel.
- **Salt flats**: in the desert's low level basins (the mesas' floor among them), a white crust
  cracked in plates (a cell noise), glossy after rain.
- **Flower fields**: in warm dry farm country a field in three is lavender, sunflowers or poppies
  in spring and summer, their mean far off.
- **Atolls** (`with_atolls`): in the warm open ocean where a field of 6.3 thousand units is high,
  the contour of a seamount noise is a reef that breaks the surface in islets around a shallow
  lagoon. 6.6% of the sea within 40,000 units; the nearest 1,000 units north of the start. Not on a
  lattice, so no atoll is cut where cells meet on the sphere. Looked at from 420 units: a ring of
  reef and surf around a lagoon.
- **Spires of an old world** (`spires_near`, `spire.gdshader`, `spire_mesh`): towers of pale stone
  240 to 360 units high with a crystal that glows at night, one for a cell in five or six of a
  lattice of 6,000 units in the planet's axes, on open land; seen from 24,000 units, placed anew
  every 1,500 units flown and when the anchor moves, carried onto the sphere by their shader, and
  among what the flight looks ahead for. Within 25,000 units of the start: 3, the nearest 19,300.
  The first looks showed none: the probe's `--look` heading was read the wrong way round (it is
  the direction (cos, sin) in x and z), and the spire stood outside the view; the instances were
  where they belong (`--say-spires`). Looked at toward it: a mast more than a tower, 6 to 18 units
  wide, so under a pixel at 24 km; now half again as wide, a white tower with a pointed top over
  the mountains from 1,300 units, and the next one on the horizon 11 km beyond.
- **Sky lanterns** (fireworks.gdshader): over the towns of red posts and upturned eaves the
  fireworks' sparks are lanterns that rise all night, drifting with the wind. No new draw.

## Cost, and the tour's hitches

Measured with the night's method (`pairs3.sh`, `m.sh`: Chrome on the NVIDIA card, the browser on
CPUs 6, 7, 14 and 15, the private Xvfb, the GPU lock for each run), HEAD's game (`efac36ead`) and
the final one back to back, from 18:35 to 19:10. The machine was not quiet: other agents' Chromes
ran on the reserved CPUs (90 to 96% busy), the load 19 to 25.

| | frames a second | the game's frames: median, p95, p99, longest (ms) | over 2x, 4x the median | GPU ms |
| --- | --- | --- | --- | --- |
| tour, HEAD | 42.0 | 20.7, 44.2, 61.8, 216.6 | 508 (7.1%), 14 | 7.4 |
| tour, new | 43.8 | 20.7, 40.4, 53.7, 122.3 | 330 (4.4%), 5 | 7.9 |
| morning flight, HEAD | 44.5 | 20.9, 42.0, 52.1, 100.4 | 133 (5.3%), 1 | 7.0 |
| morning flight, new | 46.4 | 20.2, 38.3, 49.2, 82.8 | 89 (3.4%), 1 | 7.0 |

The tour's frames by phase (`hitches.mjs`), over twice the tour's median:

| | climb | at the top | descent |
| --- | --- | --- | --- |
| HEAD: frames, over 2x, over 4x, longest | 3,130, 173 (5.5%), 7, 101 ms | 623, 30 (4.8%), 0, 81 | 3,500, 305 (8.7%), 7, 217 |
| new | 3,083, 142 (4.6%), 2, 113 ms | 632, 13 (2.1%), 0, 67 | 3,842, 178 (4.6%), 3, 122 |

The morning flight is the same flight in both (23 rings along, 6 against, a score of 118). The
additions cost the GPU nothing measurable on the ground (7.0 and 7.0 ms) and half a millisecond on
the tour (7.4 and 7.9: the far grounds drawn anew with the mesas' and atolls' terrain, the near
sea's third ground texture, the spires' one draw of up to 24); the frame rates moved with the load,
not against the game. Each addition was not measured alone: the land's (mesas, sandstone, salt,
flowers) and the sea's (atolls) are in shaders that ran before, the spires are one draw of 298
vertices an instance, the lanterns no new draw. Headless (the dummy renderer, scripts only), HEAD's
game and the new one back to back under the day's load: the frames' median 3.2 and 3.5 ms, p95
13.2 and 14.4, the same flight (terrain.gd's mesas, atolls and spires for the flight).

An afternoon pair with the tree of 15:41 (before the near sea's fix and the spires), under heavier
load (97% busy), had the tour at 31.5 and 41.6 frames a second and the climb's frames over 2x at
10.5 and 7.5%.

## Tests

On the final image: the flyover test and the touch test pass in Chrome. In Firefox the flyover
test first failed on its throttle, 0.89 for the 0.9 it wants: W held 1.5 s opens it by 0.75 from
where the corgi had it, and the corgi, descending when the board was taken, had 0.14. The test
holds W 2 s now, which opens it whole from anywhere; it passes in both (Firefox: pitch 36,
throttle 1.00, 57.3 frames a second). Firefox's touch test then timed out twice, and its flyover
test once, waiting for the game's 120th frame: gpu@0 active, one frame presented, then none for
300 to 400 s, the stall the touch test's comment describes for Firefox at 844 by 390. A copy that
printed the frames every 10 s saw 1, 1, 16 and passed (throttle 1, pitch 40, 5 touches), and the
test itself passed on its third run (throttle 0.91, pitch 39, 5 touches). Not looked into
further: one presented frame and no more, in Firefox only, at the start.
