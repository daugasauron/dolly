# Voxel Flyover research 2: Erosion-like heights: domain warp and derivative-damped fbm, then gullies

- STATUS: CLOSED
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

It is in the game on `feature/flyover-4` (since 2026-11-17 the planet, `feature/planet`, which took the game's place), checked by looking (screenshots at near, middle and far
zoom) and in a take, with frame times on NVIDIA in Chrome and Firefox and on the AMD GPU no worse
than before it (60, 59 and 30 a second) and no new pop, flicker or hitch over the fixed flight.

## Closed (2026-11-17): not to be done

The game is the planet now (`tasks/20261116-223911-planet-day`), and its mountains are still the
ridged sum whose spurs stand on their crests and whose gullies on their spurs, evaluated at the
point of the sphere (`terrain.gdshaderinc`'s `terrain_on`). A derivative-damped sum or a gully
filter is not done, by decision:

- The owner likes the mountains as they are ("I do love the mountains and how they look", the
  night of 2026-11-15/16) and asked for something else of the terrain: "there should be way more
  flat parts than mountainous in general... the super tall mountains (which are super cool)
  should be more rare". That is what the planet's make-up is, measured over 80,000 points of the
  sphere (`build/planet/rivers.mjs`): 57 % of the planet is land, and of the land 71.3 % is plain
  (under 30 units over the sea), 12.3 % river or lake, 10.1 % hill, 4.9 % mountain and 1.4 % high
  peaks (over 140), which stand along the planet's belts.
- What this step was for, mountains that do not look like noise from afar, the planet got another
  way: ground read coarsely (a far grid's, the whole planet's) is the mean of what is finer than
  it is read (`fbm3_seen`, `ridge3_seen`), so a far range is its crests and gains its spurs and
  gullies as it nears, with no sparkle.
- A change of the height function now changes it in three places that must agree (the shader, the
  flight's twin `terrain.gd`, and the planet's texture) and every place of the world with it.

If erosion is wanted later it is a stage of the planet's own (`tatr ls :planet`).
