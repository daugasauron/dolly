# Voxel Flyover research 5: Rivers, lakes and their valleys

- STATUS: OPEN
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
