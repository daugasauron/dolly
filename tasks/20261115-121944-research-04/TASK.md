# Voxel Flyover research 4: Relief light from the ground textures

- STATUS: CLOSED
- PRIORITY: 196
- TAGS: godot,demo,flyover,research,0.1.8

Step 4 of the 15 the research of 2026-11-15 ranks by what shows on screen for what it
costs (`work/research/flyover-2026-11-15.md`, section 14; its method in §3.5, §3.6). Its
size: medium. The costs are the report's estimates, reasoned from this
task's measurements and not measured: measure before relying on one.

## The step, as ranked

Hollows, ridges and aspect in the dressing (one or two texture reads), then horizon angles in the ground pass for mountain shadows across the plain at dawn and dusk. Lets the shadow cascades shrink.

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

## Closed (2026-11-16, 00:20)

Done: `ground_relief` (the difference of the ground's two textures) makes a hollow wetter and darker than a spur and keeps its snow longer (`land.gdshader`). Aspect was not used. Verified in the image of `d6993c1b2` (2026-11-16, 00:15): the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.6 a second, GPU 6.7 ms; 57.7, GPU 7.2 ms) and on the integrated AMD GPU (29.5 and 29.8, median 33.3 and 33.2 ms).
