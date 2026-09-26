# Make the cargo carousel visibly useful and reliable

- STATUS: OPEN
- PRIORITY: 260
- TAGS: game,controllers,cargo

The user sees the carousel stationary and cannot tell what it is for. Inspect
Kaiten and its real cargo supply, reach, grips, phases and receiver. Distinguish
intentional waiting from a broken physical handoff. Give it a useful role in the
cargo chain and readable interaction rather than decorative rotation.

Complete after fresh and previously stalled scenes show repeated physical
pickup→rotation→supported release→downstream collection using its visible Lua
program. Keep ordinary actuators, all unrelated actors, 20 Hz control, save/
restore, real browser rendering and measured populated performance.
Requested September 27; work deadline 12:00 JST (03:00 UTC). Evidence root:
`build/mechanics-20260927/`. Preserve the 07:45 checkpoint while iterating.

Initial evidence: in the 7,200 s saved run Kaiten has three pickups/handoffs,
returns to `scan` at 246.1 s, then has no continuing input supply. The 600 s
baseline also starts in pickup/lift/turn and ends scanning. Its stationary late
state is starvation after the three starter parcels, not a stopped controller.
Create an ongoing physical feeder/receiver chain; cosmetic idle spinning alone
would not fix its role.

Prototype feeder program `nekote-carousel-feeder.lua` discovers a nearby
carousel from its observed turntable and magnet parts and chooses inlet bays
away from the depot-facing outlet. It is prepared under the evidence root but
has not been simulated; do not treat the supply-chain fix as complete.
