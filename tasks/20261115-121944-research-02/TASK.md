# Voxel Flyover research 2: Erosion-like heights: domain warp and derivative-damped fbm, then gullies

- STATUS: OPEN
- PRIORITY: 198
- TAGS: godot,demo,flyover,research,0.1.8

Step 2 of the 15 the research of 2026-11-15 ranks by what shows on screen for what it
costs (`work/research/flyover-2026-11-15.md`, section 14; its method in §3.2, §3.3). Its
size: small for the first two, medium for the gully filter written from its description. The costs are the report's estimates, reasoned from this
task's measurements and not measured: measure before relying on one.

## The step, as ranked

Frame cost nil. Mountains stop looking like noise.

The owner's request it serves is `tasks/20261115-115857-landscape`; close both when this step does what that one asks.

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

## State (2026-11-16, 00:20)

Not started: the hills are the plain fractal sum. The derivative-damped sum would change every height, so it wants its own round with the flight's twin.
