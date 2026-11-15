# Voxel Flyover research 1: World-scale fields and rarity tiers

- STATUS: CLOSED
- PRIORITY: 199
- TAGS: godot,demo,flyover,research,0.1.8

Step 1 of the 15 the research of 2026-11-15 ranks by what shows on screen for what it
costs (`work/research/flyover-2026-11-15.md`, section 14; its method in §3.1). Its
size: small to medium. The costs are the report's estimates, reasoned from this
task's measurements and not measured: measure before relying on one.

## The step, as ranked

Continents and oceans at 3 km, a `relief` field for rare high massifs, a `weird` field for rare regions, latitude in the climate, three rarity tiers by thresholds. Frame cost nil (ground pass); a few noise calls in `terrain.gd`. Without this, every other addition repeats every half minute. It is also most of the owner's `landscape` task. Store heights around zero for the half floats.

The owner (2026-11-15 20:20): "Is it possible to make the scale even larger? To avoid the repetitive
feeling?" So the fields come as layers at every timescale of flight at the 30 units a second cruise:
about 3 km (a minute or two), 7 to 20 km (5 to 15 minutes), 30 to 100 km (rare kinds of world), each
with its own seed and rotation at incommensurate sizes, so that combinations do not repeat; and fine
detail stays smooth far from the start (measured at 1e5 and 1e6 units; recentre if it is not).

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

## Closed (2026-11-16, 00:20)

Done with `tasks/20261115-115857-landscape` and `-balance`: slow fields at 1.9, 2.7, 5.1, 7.3, 11, 19 and 53 thousand units, each with its own turn and place; oceans and continents, relief, rare massifs, countries of climate, a culture field, a realm of wonders; heights kept around 110 in the half floats. Latitude in the climate was not added (the 19 thousand field gives cold and hot countries). Far from the start measured at 100 thousand and a million units: whole; no recentring. Verified in the image of `d6993c1b2` (2026-11-16, 00:15): the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.6 a second, GPU 6.7 ms; 57.7, GPU 7.2 ms) and on the integrated AMD GPU (29.5 and 29.8, median 33.3 and 33.2 ms).
