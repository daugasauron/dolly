# Voxel Flyover research 15: The weak adapter

- STATUS: OPEN
- PRIORITY: 185
- TAGS: godot,demo,flyover,research,0.1.8

Step 15 of the 15 the research of 2026-11-15 ranks by what shows on screen for what it
costs (`work/research/flyover-2026-11-15.md`, section 14; its method in §8.5). Its
size: small to medium, by measurement. The costs are the report's estimates, reasoned from this
task's measurements and not measured: measure before relying on one.

## The step, as ranked

Slope in the ground texture so trees and buildings read the ground once instead of three and five times; then try FSR 1 at 0.5 against bilinear at 0.4 on the AMD GPU, and a last level that keeps 30 a second in place of the drop to 20.

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

## State (2026-11-16, 03:22)

Partly done by measurement: the weakest level draws the scene at 0.30 of its size (0.33 until 03:15, when the night's additions had taken its slack), 26 lots of buildings, no banks of mist, curtains of rain, herds or fireworks, and holds 30 a second. Left: the slope in the ground's texture, FSR 1.
