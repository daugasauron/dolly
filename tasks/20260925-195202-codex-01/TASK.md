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

Fresh image39 trial used only53,55,56,106,111 changed:
`build/blockwalker-battery-supply/fresh-chain-{catalog.json,c}`. The last two
programs are battery resupply work tracked in20260926-000614. At1200s the scene
has22 deliveries and no deaths, but neither warehouse has completed a job.
Maximum1800s; do not treat the isolated sailing/hauler passes as a full-chain pass.

The fresh run fails at1800s: no heavy deliveries. Hauler53 has held112 since the
first pickup, wedged at(-40.589,73.784). Contact probe confirms chassis block15
against the same shaft marker,120/120 samples, maximum302N. This pose differs
from the earlier rear-wheel jam: reversing would sweep wheel5 into the marker;
straight forward motion would move rear wheel17 over the shaft edge.

`hauler-curved-escape.js` tests short curves one part per controller tick, including
held cargo and wheel support. It admits paths that reduce aggregate terrain
overlap, then uses the existing wheel controls. The geometric probe finds a
forward1m/negative0.75rad curve with supported wheels and decreasing final overlap.
Actual1800→2160s replay fails under `freight-curved-escape`:130 final objects,
minimum up0.999981, no crane/boat handoff and trips remains1. It repeatedly moves
around the marker without escaping. Geometry did not prove the physical vehicle
could follow the curve. Steering uses distance from the initial pivot to advance
the desired heading, without correcting lateral error; inspect that execution
before changing geometry. No obstacle or opponent changes. Candidate unbundled.

The position/heading recovery also stalls (`freight-pose-escape`,120s). A matched
eight-variant physical wheel probe (`freight-steering-grid-b`) shows that ordinary
wheel commands can move the truck without overturning it. At throttle0.2/turn−0.3,
12s ends at(-43.878,73.810), yaw−2.080; scaling turn by each wheel's lateral offset
ends at(-44.985,73.261), yaw−2.452. Both minimum up0.999991. Throttle0.5/turn−0.6
drives toward the pit and drops minimum up to0.869, so these are measurements,
not safe movement programs. No engine forces or terrain changes.

The rear wheels are mounted at±2 while the other wheels are at±1; the program
previously used only the sign of that offset. Correcting the wheel commands alone
still stalls under route following (`freight-wheel-offset`). Stronger heading
feedback with forward creep also stalls (`freight-steering-torque`). Their120s
replays retain130 objects with no errors/deaths; do not promote them. The bounded
heading-integral candidate also fails120s, minimum up0.999998 and no handoff.

The crossing atz74.7 leaves little turning clearance for the long rear assembly
beside the marker at(-39.7,71.3) and the floor edge atz71. `hauler-apron-route.js`
retains the original vehicle/program and moves that crossing toz78, with the
tunnel route centered atx−43. No obstacle removal, mass change or special force.
Fresh combined `battery-freight-apron` now runs with `fresh-apron-catalog.json`
and `fresh-reload.c`:111 initial actors, at most1800s, both warehouse chains plus
repeated ammunition supply and intended-aircraft impacts. Await terminal evidence.

The apron trial fails at1800s: hauler53 is still on route1, root(-32.917,76.519),
holding112; no crane/boat/warehouse handoff. A2s probe (`battery-apron-contacts`)
confirms magnet head11 against the foundry wall centered(-29.5,6.5,82),120/120
samples, maximum265N; cargo112 parts2/3 also contact that wall. Moving the square
corner farther north made the front assembly reach the wall before turning.

Next untested candidate `hauler-diagonal-route.js` approaches diagonally from
(-33,71) to(-43,77), then through the tunnel; the return reverses that crossing.
It retains the original vehicle and steering. Verify a short fresh pickup→crane
handoff before another long combined run. Do not promote the failed apron route.

The diagonal route passes its short fresh-world physical test. It crosses
(-33,71)→(-43,77), avoiding both the pit marker and the foundry wall while keeping
the original vehicle and motor controller. Cargo112 attaches53 at20.02s,54 at
208.02s,55 at244.02s (sampled), then53 picks a different load116 at297.02s.
At300s:119 objects, minimum hauler up0.991456, no controller errors/deaths or
missing originals. Raw0, `build/blockwalker-compound-regressions-chrome-`
`freight-diagonal/salvage/regression.log` and full trace. This proves the outbound
handoff and return for another pickup; island storage still needs the combined
run. Candidate: `build/blockwalker-battery-supply/hauler-diagonal-route.js`.

Checkpoint follow-up: the fresh `battery-diagonal-drop` run fails its combined
quotas at1800s:134 objects,29 deliveries, no deaths/controller errors, zero jobs
at either warehouse. The truck reaches the quay, but pallet112 settles with its
center4.483m from crane54. Stock selection requires at least4.7m, so the crane
rejects it although an edge is reachable. Truck53 waits with its second load116.

`crane-edge-grasp.js` expands stock selection by the cargo radius (capped0.8m)
and projects the pickup point onto the arm's reachable5–7m workspace. Exact
1200→1440s replay `handoff-recovery` passes with actual magnet attachments:
112→54→55, then116→54;131 objects, no errors, missing originals or deaths.
Only54 and tender111 change in that replay. Evidence:
`build/blockwalker-compound-regressions-chrome-handoff-recovery/salvage/`.
This verifies the observed quay jam, not fresh sustained island deliveries.
The served checkpoint remains image40; these programs are not bundled.
