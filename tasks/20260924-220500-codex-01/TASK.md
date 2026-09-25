# Physically store retained cargo so receiving yards stay usable

- STATUS: OPEN
- PRIORITY: 300
- TAGS: game,physics,content,bug

Retaining scored cargo exposes a real receiving-yard jam. In the original
seed-42 1800 s trial, cranes 57/58 hold second loads against their retained first
pallets, and both barges wait in `unload`. All 99 bodies remain, with 28 total
deliveries and no controller errors. Exact poses and program memories:
`build/blockwalker-retained-population-first/segment-1800/`.

Use ordinary programmable warehouse handlers, pistons, wheels and magnets.
Keep scored cargo physical and scored once. Do not delete, relocate or weaken
loads, ignore collisions, or add character-specific engine motion. Completion
requires uninterrupted fresh-world storage of multiple distinct heavy pallets
for both teams, plus rendered Chrome/Firefox checks before packaging.

The shared sensors now expose all neighbors within 48 m, rather than stopping
at twelve closer objects, and identify the actual magnet target/part. The
in-Dolly lifecycle fixture proves a controller can find an uncollected crate
behind eighteen closer deliveries while excluding an out-of-range crate.
A rendered 104-object comparison found no speed benefit from the old cap
(48.08 versus 46.44 FPS); keep the useful observations.

The candidate six-wheel forklift uses 72 Nm motors, raised transit, measured
cargo position, an oriented clearance corridor and reverse route following.
It checks physical support and obstacles when planning storage. A saved-jam
continuation chain physically stores all four original pallets, unheld,
grounded and scored once, retaining 113 bodies without program errors:
`build/blockwalker-forklift-{dual-energized,crane-placement,retreat-heading}/`.
This establishes recovery of the saved jam, not fresh uninterrupted operation.

The first fresh 1800 s candidate stores only one East and two West pallets,
with 109 retained bodies and 30 deliveries. Its final assertion fails. The
old harness lost its oversized trace and world download; only the terminal
result remains in `build/blockwalker-rivalry-fresh-storage42/`. The deterministic
1200 s replay exported a usable world under the `-replay/` directory before
trace compression failed. Current tests download the world first and split
traces into 300 s chunks.

That replay exposes a route-grid endpoint bug: a clear continuous pickup point
rounds into an inflated landing-pad obstacle. Accepting a reachable neighboring
cell and checking the final continuous segment fixes this state. The 180 s
`build/blockwalker-forklift-route-arrival/` continuation completes East job 2
and stores all three delivered loads on actual support, clear of their depots,
with 104 bodies retained. Candidate: `build/blockwalker-rivalry/arrival-crew.json`.

The subsequent one-way-engine run stalls upstream before any heavy delivery;
its saved world is `build/blockwalker-rivalry-one-way-teams42/`. The separate
thruster task tracks wider barge mounts and oscillating aircraft controllers.
Those fixes pass isolated tests; `compact-tuned42` is repeating the full fresh
1800 s workload. Keep this issue open until multiple storage cycles pass.

That transport repeat makes 28 deliveries, including five heavy pallets, but
stores only East 2 / West 1 (`build/blockwalker-rivalry-compact-tuned42/`). An
unchanged 180 s continuation exposes a deadline bug: long travel consumes the
storage alignment timeout, so the truck abandons destinations on arrival.
Alignment now has its own phase, requires the planned heading and a closer
arrival, and empty trucks return to their starting staging area.

East also boxed itself beside its second stored pallet. Its four-neighbor grid
rejects the actual diagonal exit. The candidate checks diagonal steps and their
midpoint clearance. A 360 s replay physically escapes, picks up East's next load
and stores West's second and third loads. Five of six delivered pallets are
supported, unheld and clear; East still carries the sixth away from the receiving
pad. All 124 bodies remain without program errors. Evidence:
`build/blockwalker-forklift-storage-diagonal/`. These programs are now in the
branch catalog; the fresh 2400 s `checkpoint42` trial is checking the full chain
before packaging.

The 2400 s fresh repeat retains all 122 objects and 33 scored crates, with no
controller errors, but stores only East 1 / West 2. East pushes its second
pallet sideways during pickup, then repeatedly selects the same unreachable
approach. The candidate uses the actual magnet-pole position for final approach
and tries alternative clear approaches when routing fails. It also clears the
completed job so deposited cargo becomes an obstacle for the empty return.
`build/blockwalker-storage/pole-pickup.js` is being replayed against the exact
saved failure; it is not yet canonical.

The exact 180 s replay succeeds: the displaced East pallet is retrieved and
stored, giving four of four supported, unheld heavy loads clear of the pads.
All 123 objects remain; the trucks are returning to staging or seeking work.
Evidence: `build/blockwalker-forklift-pole-pickup/`. Fresh repeated cycles
still need verification, along with the independently stalled ore hauler.

The follow-on 180 s replay keeps all four loads stored and both trucks return
to their staging areas. The corrected pickup program is now in the branch
catalog; the next fresh combined run must verify repeated delivery and storage.

The image 29 fresh 2400 s repeat retains 117 objects and completes 27 light
cargo deliveries without errors, but neither warehouse receives heavy cargo.
The quay loading crane is blocked on pallet 92, so this run does not exercise
the updated warehouse programs. Evidence and the saved upstream failure are in
`build/blockwalker-rivalry-image29-fresh42/`; see the freight task. Keep this
issue open until repeated fresh heavy deliveries actually reach both handlers.

With the prototype raised quay crane, the fresh isolated 1800 s chain delivers
and stores one West pallet. East's receiving crane gets stuck before releasing
its load, so its warehouse still receives nothing. The warehouse issue remains
open; `build/blockwalker-rivalry-crane-fresh-chain/` preserves this next failure.
