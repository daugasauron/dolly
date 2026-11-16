# Voxel Planet stage 5: Far ground fixed to the planet: cube faces or CDLOD reading GPU tiles

- STATUS: OPEN
- PRIORITY: 275
- TAGS: godot,demo,planet,0.1.9

The research and its plan: `work/research/planet-2026-11-16.md`; the parent task is `tasks/20261116-133746-planet`.

Far ground is read from one texture of the whole planet (4096 by 2048 texels by longitude and
latitude: 920 units a texel at the equator, finer toward the poles, where it is wasted), and
between 2,300 and 147,000 units from three grids on the chart's lattice. What is left:

- From 30,000 to 300,000 units up the ground is seen at the planet's texture's 920 units a texel
  or at a grid's 384 or 1,536: soft. Tiles made on the GPU as they are needed, fixed to the planet
  (cube faces, a quadtree by distance), finer near the flyer.
- A move of the chart's anchor changes the lattice of the grids with their own ground, and with
  it the far ground's shape a little. Ground fixed to the planet does not change.
- The planet's texture is drawn in one frame at the start (8 million texels of the height
  function): measured in the parent task. A viewport that is not cleared kept only its last
  strip, so it is not yet spread over frames.
- The mean of the ground is the function with its fine octaves at their mean, not the mean of the
  function: a coast read coarsely lies where the mean ground meets the sea, and mountains read
  coarsely are lower than their peaks.

Done when: the ground at every height is no coarser than two pixels, and nothing of it changes
when the anchor moves.
