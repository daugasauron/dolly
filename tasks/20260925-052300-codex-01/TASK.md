# Recover seabed cargo with winch salvage boats

- STATUS: CLOSED
- PRIORITY: 240
- TAGS: game,content,physics

Give the new cable block a useful job in the shared world. In the populated
3000 s world, two of West's three fired light crates lie on the seabed and its
recovery truck cannot reach them. Build a stable industrial salvage boat with
a freely hanging winch magnet, controlled by an ordinary editable program.
Recover existing cargo, ferry it to an accessible handoff and leave it for the
land crew. Keep all cargo, guards and other machines physical and present.

Verify real underwater pickup, loaded reeling and buoyant transport, handoff,
interrupted pickup and loaded save/reopen. Then prove a recovered crate reaches
the loader and slinger in the combined world. Inspect the boat and visible
cable in Chrome and Firefox before bundling it. No actor-specific engine logic,
teleports, ammunition respawning or hidden movement helpers.

Starting evidence: `build/blockwalker-rivalry-wide-patrol-continued/blockwalker-
world.json`; cable mechanics and rendered hoist: `test/fixtures/blockwalker-
winch.c`, `test/fixtures/blockwalker-winch-view.mjs`.

The unbundled prototype now physically recovers a crate from 7.7 m below the
world origin, retains its load through save/reopen, notices a manual magnet-off
interruption, retrieves the dropped crate again and places it on shore. Its
ordinary program folds the boom, sails, unfolds and lowers until measured
support. The 300 s trial records two pickups, one shoreline handoff, minimum
up=0.992695 and maximum joint error 0.001741 m. Cargo remains unheld and physical
on the mainland afterward. `build/blockwalker-compound-regressions-chrome-
salvage-long-hulls/` records the complete trace and saved world.

The shallow pontoons rolled under the crane. Deeper hulls solved initial
stability, but the alloy hook was nearly neutrally buoyant and could not reach
the deep crate. A ballast magnet supplies sinking weight; a rotating
counterweight and longer pontoons keep the loaded boat stable during travel.
These are blueprint changes, with no altered buoyancy, actuator force rules or
engine exceptions. The current design has 129 parts and a 3x3 bearing.

The populated continuation preserves the exact 3000 s world and adds only this
boat. It uses existing submerged ammunition, broadcasts ready after unloading
and releases its claim so the land crew can collect it. Patrol, real crew
handoffs and rendered inspection remain before promotion. Prototype files live
under `build/blockwalker-salvage/`; canonical source and served image remain 35.

The first populated continuation retained all 134 original objects and their
programs, reached 138 objects/45 deliveries without deaths/errors and physically
recovered fired crate 91. Loaded reopen passed. Its fixed docking waypoint let
wave-induced roll place the cargo just beyond the shore; it lowered back into
water and never handed off. Evidence: `build/blockwalker-compound-regressions-
chrome-salvage-populated/salvage/`. The next prototype extends the boom two blocks
and aligns the actual suspended cargo before lowering; it remains unbundled.
Chrome rendered the loaded prototype without errors in `build/blockwalker-
salvage-view-chrome/`; visual inspection confirms the cable and crane layout.

The 131-part crane with actual load alignment succeeds in the existing world:
cargo 91 is released at (98.598,0.485,-25.899), then picked up by truck 93 at
3268.617 s. Boat also retrieves the second submerged round (89) at 3593.617 s.
The 3154.6 -> 3754.6 continuation retains all 135 old objects (143 total),
records 50 deliveries, no deaths/program errors and minimum boat up=0.989301.
Only warehouse programs 77/78 changed to address their separate execution-budget
failure (task 20260925-061503); boats, trucks, loaders and guards keep their
programs and all objects remain. `build/blockwalker-compound-regressions-chrome-
salvage-warehouse-resumed/salvage/` contains the trace and exact loaded/dock saves.
Truck still carries 91; loader/slinger reuse is not yet proved. Continue this
world with the separately measured truck return-route candidate.

The next continuation delivers round 89 as well, but later rolls while hoisting
cargo 25 close to the Quayfin tender (4076.15 s). The original boat lacked
obstacle checks. The unbundled follow-up uses its measured hull footprint,
observed terrain and floating traffic to reject obstructed approaches, postpone
that cargo and steer through clear local water. It resumes the prior upright
3754.6 s save; no object is moved or removed to recover from the failed trial.
Evidence of the failure: `build/blockwalker-compound-regressions-chrome-
salvage-return-route/salvage/`. Warehouse 78 completes its fifth stored load
in this run with the bounded planner; trucks still need compatible routing and
escape clearance.

The safe-clearance continuation passes 3754.6 -> 4354.6 s: all 143 prior objects
and all unmodified programs/blueprints remain (149 total), 56 deliveries, zero
deaths/controller errors/crew contacts/rollovers, minimum boat up=0.987748.
Both recovered rounds complete the physical chain. Round 91: truck -> loader
at 3822.617 -> slinger at 3857.617 -> fired at 4059.617. Round 89: boat -> shore
at 3756.617 -> truck at 3862.617 -> loader at 4068.617 -> slinger at 4103.617 ->
fired at 4197.1. West shots increase 3 -> 5; East 6 -> 8. Both warehouses reach
five stores. The boat now rejects the obstructed cargo and patrols safely.
Evidence: `build/blockwalker-compound-regressions-chrome-salvage-safe-clearance/`.
Fresh-world and final Chrome/Firefox inspection/packaging remain.

Chrome and Firefox both render the loaded dock scene and 149-object continuation
with no errors or model requests; images were inspected. Evidence:
`build/blockwalker-salvage-view-{chrome,firefox}/`. `build/blockwalker-salvage/
relay-proof.json` verifies both ordered physical holder chains across the three
explicit program-update continuations.

Fresh startup then exposed empty-boat roll while slewing and accelerating
simultaneously (14 s, `...-salvage-fresh/`). The latest program halves maximum
slew command and holds translation until bearing angle/rate settle. Empty 300 s
patrol plus reopen passes (minimum up .910553, `...-salvage-empty-slew/`). The
latest deep interrupted trial also passes: two pickups/one shore handoff,
loaded reopen and manual magnet-off, min up .989881, max joint error .002953 m
(`...-salvage-safe-interrupted/`). The full fresh-world replay is running with
this startup correction; it remains unbundled.

Fresh 1200 s now completes a boat recovery/handoff and both crews' restocking:
East four recoveries/seven shots, West two/five; 119 objects/25 deliveries,
zero errors/deaths/crew contacts/truck tipping. Its only unmet assertion is the
new warehouse chassis-load case, tracked in 20260925-070046. The exact-save
300 s correction completes that store with 125 objects/31 deliveries. This is
a fresh 1200 s run followed by an explicit warehouse-only update, not a single
uninterrupted 1500 s candidate run. Final catalog retains all 93 designs,
updates four crew programs and appends the 131-part boat; image 36 is building.

Verified in packaged image 36 on September 25, 2026. Chrome and Firefox match
all 94 bundled blueprints/programs and restore the 125-object format-2 world,
the original 51-object format-1 world (retaining its sixteen historic deaths),
and the 125-object format-5 continuation without new errors or deaths.
Evidence: `build/blockwalker-image36-preview{,-firefox}/proof.json`.
Snapshot SHA-256:
`aaa757c571d6f3234e0a52570f9ecc7d9f2c50f0a66f3349e08e75af3cc45c38`.
All six protected files, twelve other images and thirteen catalog entries pass
`build/blockwalker-image36-preservation.json`. No public deployment was made.
