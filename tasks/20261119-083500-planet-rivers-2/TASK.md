# Voxel Flyover: lakes above the sea, waterfalls, bridges, and rivers seen from orbit

- STATUS: OPEN
- PRIORITY: 190
- TAGS: godot,demo,planet,0.1.9

What `tasks/20261115-121944-research-05` (rivers, lakes and their valleys) left when it was
closed against its first step for 0.1.8 (flow drawn on the river water, rivers seen to the
middle distance). The coordinator split it on 2026-11-19, because the rest did not fit before the
0.1.8 release.

## What there is (2026-11-19)

A river follows the contour of a noise in three dimensions of 900 units, bent by a second of 310
(`river_on` in `demos/godot/voxel-flyover/terrain.gdshaderinc`): a river is under 0.012 of it and
its valley under 0.1. It is cut to the sea's level (2.5 under it) where the land is under 90
units over the sea, and a slow noise of 1,300 units widens some stretches into lakes. Over 80,000
points of the planet, 12.3 % of the land is river or lake (`build/planet/rivers.mjs`). The water
on it is the sea's: the near sea plane (`water.gdshader`) and grid 3's level sea draw it.

## Left

- **Lakes above the sea.** A lake's level is one height for all of it, which is not a function
  of the place alone as the rest of the world is: it takes a lattice of basins (a level per cell
  of a coarse lattice, from the lowest rim around it) that both the shaders and `terrain.gd` read.
- **Waterfalls.** Rivers run at the sea's level, so nothing falls: rivers above the sea first,
  stepping down where a valley meets a lower one, then a fall drawn there as a landmark.
- **Bridges.** Where a town's roads (`settled_on`) cross a river: a span over the valley.
- **Rivers seen from far and from orbit.** A river is some tens of units wide, under a texel of
  the far grids (384 units and more) and of the planet's whole texture (some 900 at the
  equator): drawn there, the noise's contours alias into a mesh of lines. It takes rivers drawn
  wider by distance, from a coarser contour that the near rivers refine, or lines of their own.

## Done when

Each is in the game on `feature/planet`, looked at in stills near, middle and far and in a take,
with frame times on NVIDIA in Chrome and Firefox and on the AMD GPU no worse than before it.
