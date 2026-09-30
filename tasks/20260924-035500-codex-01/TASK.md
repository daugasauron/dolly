# Keep water buoyant beneath piers

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,physics,water

A floating crate drifting under the harbor pier is treated as buried terrain
and loses buoyancy. The height query sees the deck above the water and treats
the entire column below it as solid. This interrupted a physical tug-to-crane
handoff in `build/slopyard-tug3.log` (crate 4 removed at 255.25 s).

A minimal in-Dolly reproduction drops identical hull crates at (106,-1.75,10)
under the pier and (125,-1.75,10) in open water. After 60 s only the open-water
crate survives. Evidence: `build/slopyard-water-before.log`,
`build/slopyard-tug-water-before/{tug-trace.csv,slopyard-world.json}`.
Completion requires actual floating cargo below the pier, normal solid support
on top, correct ground sensors and continued rejection of buried/sunk actors.
Verify the change in Dolly, including restart and existing world mechanics.

`terrain_floor(position)` distinguishes an overhead deck from a supporting or
containing solid. Buoyancy, physical failure checks and the root ground sensor
use it; spawn and navigation height queries retain their existing semantics.

Verified by `build/slopyard-tug-driver1.log` (exit 0), compiling C inside Dolly.
Five cases survived 60 simulation seconds and a restart: floating below the pier
and in open water, resting on the deck, below the island beam and on its roof.
Their ground readings were -12, -12, 0, 4 and 19 m. Buried and sunk bodies still
report their proper failure causes. The same run passed physical cargo scoring,
loaded restart, courier stacking/traffic, repeated gantry transfers and the new
tug-to-crane handoff (delivery at 91.417 s). The 49-object world survived 600 s
and three reloads without removals in `build/slopyard-tug-full-42.log`.
