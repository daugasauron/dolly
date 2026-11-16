# Voxel Flyover research 14: Specular anti-aliasing and analytic line filtering

- STATUS: CLOSED
- PRIORITY: 186
- TAGS: godot,demo,flyover,research,0.1.8

Step 14 of the 15 the research of 2026-11-15 ranks by what shows on screen for what it
costs (`work/research/flyover-2026-11-15.md`, section 14; its method in §8.4). Its
size: small. The costs are the report's estimates, reasoned from this
task's measurements and not measured: measure before relying on one.

## The step, as ranked

The roughness-variance formula in water, land and city; integral-filtered stripes for streets, panes and rows. A handful of operations; lowers the task's shimmer measure where glitter and far towns are.

## Licences

Reuse only what section 13 of the report allows: Johansen's erosion filter, Clay John's and
Fewes's erosion noise and Shadertoy shaders without a stated licence are not copied (CC BY-NC-SA
or MPL over it); formulas from papers and Quilez's articles are written in the game's own
functions; afl_ext's ocean is MIT by its header, to be confirmed on its page and recorded in
`docs/sources.md` if adapted.

## Done when

It is in the game on `feature/flyover-4`, checked by looking (screenshots at near, middle and far
zoom) and in a take, with frame times on NVIDIA in Chrome and Firefox and on the AMD GPU no worse
than before it (60, 59 and 30 a second) and no new pop, flicker or hitch over the fixed flight.

## Closed (2026-11-16, 04:08)

Tried and not kept. The roughness-variance formula in the sea and the land (`sqrt(r² + min(2·variance, 0.18))`, the variance from the normal's screen derivatives) left the task's shimmer measure over the fixed flight as it was: 1.007 (max 2.436) before, 1.007 (max 2.431) with it, flicker 17.24 and 17.23 per mille. The sea's roughness already widens with what a pixel covers, and the ripples finer than a pixel already give way to their mean; the walls' normals are flat. Not needed; the lines were taken out again.
