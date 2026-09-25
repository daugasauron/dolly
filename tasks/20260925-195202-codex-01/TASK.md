# Unblock East heavy freight before the warehouse

- STATUS: OPEN
- PRIORITY: 230
- TAGS: game,content,bug

In fresh competition-v5, parcel 99 remains aboard freighter 55 at 1500 simulated
seconds. East warehouse 77 receives no delivered heavy cargo within its 48 m
range in any of the 750 samples. Its loaded-cargo storage regression passes.
Reproduce from `build/blockwalker-compound-regressions-chrome-competition-v5/`
`salvage/blockwalker-world.json`; verify a real delivery followed by storage.

The unchanged continuation identifies a route bug: every reverse maneuver
retreats one waypoint, leaving the boat trying to reach the original loading
quay through the mainland. Shore contacts reach 2614 N. The first candidate
retains route progress and uses observed shore clearance, but its 720-second
replay still fails: the boat then jams against salvage boat 94 near (124, 30).
Its reverse-only escape points into the harbor walkway.

An unbundled second candidate chooses a clear escape direction from existing
terrain and nearby sensors, then uses its normal side/fore-aft thrusters while
holding heading. It preserves other controllers and all actors. The exact
2220→2640-second jam replay passes: contact tracing confirms boat 94, freighter
55 unloads 99, receiving crane 57 hands it off, and warehouse 77 lifts and stores
that same parcel. Freighter deliveries and warehouse jobs both increase 0→1;
minimum up is 0.959849, 123 final objects, no controller errors or deaths. All
machine blueprints remain unchanged; delivered parcels receive normal recolors.

Evidence: `build/blockwalker-compound-regressions-chrome-checkpoint-freighter-escape/`
`salvage/freight-proof.json`, full contacts and final world. The failed first
candidate remains under `...-chrome-checkpoint-freighter-shore/salvage/`.
Candidate: `build/blockwalker-checkpoint-followup/freighter-escape.js`.
Fresh combined verification and packaging are still required. The served
checkpoint remains `ce3a392`.

Fresh combined trial fails both warehouse quotas. Freight never reaches either
boat: hauler 53 remains in carry with 99 near (-40.24, 74.30), quay crane 54 has
no jobs, and 55 stays in load with no cargo for the entire run. Parcel 103 waits
on the foundry lift. This does not exercise the sailing fix. Diagnose the hauler's
actual contacts/route before treating its final pose as a cause. Exact saved
world and trace: `...-chrome-checkpoint-combined/salvage/`.

Contact diagnosis confirms hauler53 rear wheel17 catches the shaft-edge marker
at(-39.7,0.6,71.3). A generic reverse recovery checks a2m path against terrain,
one part per controller tick, then uses the existing wheel keys. The initial
all-parts check exceeded the controller budget and was rejected.

The exact1500→1860s replay changes only53's program and passes: parcel99 moves
53→54 at1639s→55 at1668s;53 returns and collects103, trips1→2. Minimum up.990627,
122 final objects, no errors/deaths, all original actors/blueprints preserved.
Evidence: `build/blockwalker-compound-regressions-chrome-renewal-hauler-transfer/`
`salvage/hauler-proof.json`, raw C status0. Candidate:
`build/blockwalker-world-renewal/hauler-recovery-budget.js`.
A previous replay failed an incorrect hauler depot-score assertion despite the
handoff; the final fixture checks the physical intermediate transfer instead.
Fresh combined verification remains required; image38 bundles neither candidate.

Fresh image39 trial is now running with only53,55,56,106,111 changed:
`build/blockwalker-battery-supply/fresh-chain-{catalog.json,c}`. The last two
programs are battery resupply work tracked in20260926-000614. At1200s the scene
has22 deliveries and no deaths, but neither warehouse has completed a job.
Maximum1800s; do not treat the isolated sailing/hauler passes as a full-chain pass.
