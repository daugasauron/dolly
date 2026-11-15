# Voxel Flyover research 9: Horizon landmarks at three rarities

- STATUS: OPEN
- PRIORITY: 191
- TAGS: godot,demo,flyover,research,0.1.8

Step 9 of the 15 the research of 2026-11-15 ranks by what shows on screen for what it
costs (`work/research/flyover-2026-11-15.md`, section 14; its method in §9.1, §12). Its
size: medium. The costs are the report's estimates, reasoned from this
task's measurements and not measured: measure before relying on one.

## The step, as ranked

On a jittered grid of kilometre cells with a far form each: cloud-capped peak, volcano with plume and night glow, lighthouse with a turning beam, world tree, karst towers in a turquoise sea. Something unreached is always in view.

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
