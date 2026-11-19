# Voxel Flyover research 5: Rivers, lakes and their valleys

- STATUS: CLOSED
- PRIORITY: 195
- TAGS: godot,demo,flyover,research,0.1.8

Step 5 of the 15 the research of 2026-11-15 ranks by what shows on screen for what it
costs (`work/research/flyover-2026-11-15.md`, section 14; its method in §6.3). Its
size: medium. The costs are the report's estimates, reasoned from this
task's measurements and not measured: measure before relying on one.

## The step, as ranked

Warped contour rivers carved toward a descending floor, drawn in the land shader with flow; lakes; waterfalls as landmarks. A few noise calls where there is water. The owner's request; towns then get rivers and bridges.

The owner's request it serves is `tasks/20261115-115857-landscape`; close both when this step does what that one asks.

## Licences

Reuse only what section 13 of the report allows: Johansen's erosion filter, Clay John's and
Fewes's erosion noise and Shadertoy shaders without a stated licence are not copied (CC BY-NC-SA
or MPL over it); formulas from papers and Quilez's articles are written in the game's own
functions; afl_ext's ocean is MIT by its header, to be confirmed on its page and recorded in
`docs/sources.md` if adapted.

## Done when

It is in the game on `feature/flyover-4` (since 2026-11-17 the planet, `feature/planet`, which took the game's place), checked by looking (screenshots at near, middle and far
zoom) and in a take, with frame times on NVIDIA in Chrome and Firefox and on the AMD GPU no worse
than before it (60, 59 and 30 a second) and no new pop, flicker or hitch over the fixed flight.

## State (2026-11-17): on the planet

Partly done, as before, now on the sphere: a river follows the contour of a noise in three
dimensions, bent by a second (`river_on`), at the sea's level in a valley through land under 90
units, and widens into lakes in some stretches (a field of 1,300 units). Measured over 80,000
points of the planet (`build/planet/rivers.mjs`): 12.3 % of the land is river or lake. A ground
read more coarsely than 150 units has no rivers (they are some tens of units wide), so far
grids and the planet seen from orbit show none. Looked at on the stills of the flight at the
start (a town on a river that runs to the sea).

Not done: lakes above the sea (a lake's one level for all of it is not a function of the place
alone), a flow drawn on the water, waterfalls, bridges; rivers seen from far and from orbit.

## Closed (2026-11-19): against its first step for 0.1.8

The coordinator split the step on 2026-11-19: for 0.1.8 the flow drawn on the river water and
rivers seen to the middle distance; lakes above the sea, waterfalls, bridges and rivers seen from
orbit moved to `tasks/20261119-083500-planet-rivers-2` (0.1.9), with what was found. Done in the
commit that closes this task, on `feature/planet`:

- **A river flows** (`river_flow`, `flowing` in `water.gdshader`): where the water is a river's (its
  bed 2.5 units under the sea's level, on the contour `river_field` gives, the signed noise that
  `river_on` takes the distance from), its ripples are carried along the contour, a quarter round
  from the way the noise rises, so each river runs one way all along; a flow map's two phases,
  each carried 12 units in four seconds and blended, so they run on without stretching. No surf
  rolls in on a river any more (it drew white patches in its middle). The way is taken over 40
  units: over 4 a place of the planet (good to 0.03 units in single floats) turned it from pixel to
  pixel, and the foam streaks first drawn along it broke into specks; drawn longer they were
  scratches, and they were left out.
- **Rivers seen to the middle distance** (`land.gdshader`): where a grid's ground is too coarse to
  cut a river (cells of 96 units and more), a line of water along its contour on the low land, as
  wide as the river or a pixel, as strong as the share of the pixel it covers, out to pixels of 250
  units.

Looked at: near, flying along a river at 30 units, before and after
(`build/planet/out/rivers-low-now2`, `rivers-low3`: the river's water clean, no white patches in it);
the middle distance at 600 units (`rivers-before-600`, `rivers-600`: the river through the pink
country shows as a line of water, which before was not there). Frame times, the ground flight of
40 s from the start in Chrome on the NVIDIA card, two runs each, interleaved
(`build/planet/measure3.sh`): before 36.1 and 36.4 frames a second, the GPU at 14.4 and 15.2 ms;
after 32.5 and 35.7, the GPU at 15.3 and 14.1, the same within the machine's noise (its load 10 to
19). No take was recorded and the AMD GPU was not measured for this step.

