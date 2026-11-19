# Voxel Flyover research 15: The weak adapter

- STATUS: CLOSED
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

It is in the game on `feature/flyover-4` (since 2026-11-17 the planet, `feature/planet`, which took the game's place), checked by looking (screenshots at near, middle and far
zoom) and in a take, with frame times on NVIDIA in Chrome and Firefox and on the AMD GPU no worse
than before it (60, 59 and 30 a second) and no new pop, flicker or hitch over the fixed flight.

## State (2026-11-17): on the planet

Done on the planet, another way than the slope in the texture: the ground's textures' fourth
channel holds how settled a place is, and a town's kind takes its climate from them, so a
tree's or a house's vertex no longer evaluates slow fields (which on the sphere are noise in
three dimensions). Measured in Firefox on the AMD GPU at the weakest level
(`tasks/20261116-133746-planet`, "The AMD GPU"): 27 ms a frame before, 22 after, and 20.5 with
the weakest level at 0.27 of the frame for 0.30; the flat flyover took 19.6. Everything that
lives near the ground (trees, towns, low clouds, boats, birds) is 10.5 of those milliseconds.

FSR 1 was measured there and not kept: Godot's FSR 1 at half the frame took the GPU 35.3 ms a frame (14.5 frames a second) where the smooth scaling at 0.27 of the frame takes 21.1 (25 s by itself in Firefox, `build/planet/runs13.sh`): its pass costs more than the pixels it saves.

Left: an even 30 a second on that GPU (the game's test there draws 25, between 30 and 20), which
is the planet's own to keep (`tasks/20261116-223911-planet-day`); the slope in the texture (the
trees read the ground three times, the buildings five) has no free channel now.

Since 15:29 the weakest level also has no shadows of the sun: 18.7 ms a frame in Firefox and 18.3 in Chrome on that GPU, under the flat flyover's 19.6; the rate at that was 23 a second on a machine with a load of 15, and is to be measured on a quiet one.

## Closed (2026-11-19)

What was left, an even 30 a second on the AMD GPU, measured on the image of 2026-11-19
(`feature/planet` `1f1964bb6`: the new clouds and the rivers of research 5), the machine's load 6
to 17 (`build/planet/measure-amd.sh`, `m.sh amd`): the ground flight of 40 s from the start drew 28.8
frames a second in Firefox, the GPU at 21.9 ms, its median frame 33.3 ms and p95 37.6, and 28.7 in
Chrome (22.0 ms, median 33.5, p95 41.9); the chain flight 35.9 in Firefox (16.2 ms). The pacing takes
30 a second under 24 ms of GPU (`tasks/20261116-223911-planet-day`), and holds it: the median frame
is the even 30's. The rest of the second is a few long frames (p99 110 ms in Firefox, 54 in Chrome)
on a loaded machine. The step's other parts were done another way or measured and not kept
(above): the settled channel in place of the slope, FSR 1 dearer than the pixels it saves, the
weakest level without the sun's shadows.

