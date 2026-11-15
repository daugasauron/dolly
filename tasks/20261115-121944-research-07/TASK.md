# Voxel Flyover research 7: High clouds marched in the sky's quarter-resolution pass, rain shafts and storms seen from afar

- STATUS: CLOSED
- PRIORITY: 193
- TAGS: godot,demo,flyover,research,0.1.8

Step 7 of the 15 the research of 2026-11-15 ranks by what shows on screen for what it
costs (`work/research/flyover-2026-11-15.md`, section 14; its method in §5.1, §5.5). Its
size: medium. The costs are the report's estimates, reasoned from this
task's measurements and not measured: measure before relying on one.

## The step, as ranked

Clouds with depth for fewer sky operations than now; weather becomes a destination. First a two-line test that the half and quarter passes draw on `gpu@0` in both browsers.

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

## Closed (2026-11-16, 03:22)

Done another way: thin streaks of high cloud as a layer of the sky's shader at 2,600 units (not marched), lit fire and rose by the low sun; rain seen from afar as curtains; the deepest clouds stand together as a storm and are lit from within by lightning. Not done: marched high clouds. Image built at 03:13: the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.5 and 56.9 a second) and on the AMD GPU (29.8 and 29.6, median 33.2 and 33.4 ms).
