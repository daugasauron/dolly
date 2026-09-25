# Blockwalker handoff

Work only in `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-playground-20260923`. Do not modify the parent worktree or
other previews. The active goal continues current issues and a more lively
world through September 25, 21:00 JST. No push or deployment is authorized.

The owned preview is `http://127.0.0.1:9099/blockwalker/`, user service
`dolly-blockwalker-preview-20260924.service`; relay 9010. Image 35 is built,
served and verified in Chrome and Firefox. No owned disposable browser remains.
It built inside Dolly in 42.1 s, retains all 93 designs and twelve other images.
Snapshot: 234571698 bytes, SHA-256
`62c4cecaa0d5b68e0d48dbca0b7f651beb5978c48f6f9b48f665f014bac077d0`.
Source: 22 files, 1176576 bytes, SHA-256
`42a882d7abe466aec3ab476e012d64bbcced33cba1422a018f716571fabcc94c`.
Packaged proof: `build/blockwalker-image35-preview{,-firefox}/proof.json`.
Both browsers verify every bundled blueprint/program and restore/advance BOTH
`build/blockwalker-world-ui-chrome/blockwalker-world.json` (125-object format 2)
and `build/blockwalker-recovery-20260923/state/blockwalker-world.json` (original
51-object format 1), with zero browser errors/model requests. Original IDs,
programs and historical removals remain; format 1 migrates opposed thrusters.
The latter already recorded sixteen deaths; neither tests nor imports erase them.

Image 34's original-save test exposed a prismatic static-endpoint assertion.
An eight-block opposing-piston reproduction fails identically. The correction
orders the movable piston body second and reverses both axes to preserve
extension direction. It passes extension/retraction with <0.7 mm error and the
original save survives twenty reopens plus ten seconds without new deaths/errors.
Task `20260925-052900` is closed. Combined canonical check, including builder,
loaded winches and all bearings: `build/blockwalker-image35-canonical-proof/`.
The local checkpoint is named `Add cable winches and restore anchored piston loops`.
No truck route experiment is promoted. The next work is the salvage-boat task.

Winch is part kind 8. It joins a parent block to a free-swinging endpoint with
a slack upper-distance constraint, finite-force reeling and braking when keys
are released. Maximum cable capacity is 24 m, minimum reeled length 1 m.
`angles/rates` report actual distance/radial speed; `winches[part]` reports
paidOut/tension. World format 5 retains paidOut separately; design format 4 and
plain character format 9 remain backward-readable. Bad imports are atomic.
Rendered cable sags but has no collision/wrapping. The inspector edits keys,
force, speed and capacity. There is no new world machine yet.

Canonical combined browser check passes all broad-bearing physics/builder
operations, winch mechanics, loaded save/reopen x20, seven malformed imports,
legacy format 4 import, ordinary-program magnetic hoist, rendered slack and
builder controls/export/import: `build/blockwalker-winch-canonical-proof/` and
`build/blockwalker-winch-canonical.log`. Both negative and powered-force cases
are real simulations: 2 N cannot lift 7.301 N; 24 N lifts 1.561 m in three
seconds. Free chassis reacts at the offset anchor and conserves momentum.
The rendered hoist lifts a magnetic crate over 2 m and then pays out slack.
Firefox independently passes the same block/state/render/UI workload plus
bearing regressions and twenty reopens of the previously crashing 97-object
save: `build/blockwalker-winch-view-firefox/`. Chrome also passes independently
in `build/blockwalker-winch-view-chrome/`. Lab generators under
`build/blockwalker-winch/` predate source promotion: do not rerun them over the
canonical files. The game source is authoritative now.

All machinery behavior remains ordinary editable programs using common sensors,
actuator keys and radio. No actor-specific motion helpers, teleports, deleted
cargo or weakened guards. Physics remains 60 Hz. Existing saves keep their own
programs/blueprints; new bundled content appears in fresh worlds.

Broad turntables (1x1, 2x2, 3x3, 4x4) mount on multiple blocks across both faces.
Both slingers use two 3x3 bearings, open-frame masts, exposed rotors,
counterweights and retracting pedestals; loaders start 16 m away. This request
was committed in `56f29b7`; recovery trucks in `108b25d`. The isolated compound
600 s interrupted trial completes four recoveries, three full truck/loader/
slinger chains and shots, one aircraft hit, loaded reopen and manual magnet-off
recovery without crew contacts: `build/blockwalker-launcher-compound-interrupted/`.

Rigid adjacent blocks share compound bodies. All shapes/materials, local forces,
buoyancy and self-collision are retained. Box3D's upstream SIMD path compiles
inside Dolly. `0b95170` also fixes restore quaternion drift and six freight
machines (catalog rows 52..57), plus Northline support feedback and Harbor Atlas
luff clearance. Do not reapply `build/blockwalker-compound/candidate.tar`: it
predates the restore fix. Exact failure world:
`build/blockwalker-compound/repeated-restore-failure.json`.

The image-33 2400 s populated trial retains 127 objects, records 35 deliveries,
six heavy freight chains and two stored loads per island, with zero controller
errors, crew contacts or truck rollovers:
`build/blockwalker-rivalry-compound-freight-populated42/`.
The unchanged warehouse continuation proves three stored per island, 130 objects
and 38 deliveries: `build/blockwalker-forklift-image33-warehouse-baseline/`.
Those freight/warehouse tasks are closed. Firefox renders its crowded save at
48.15 FPS after 30 s warmup with near-real-time simulation and no errors:
`build/blockwalker-rivalry-view-firefox-crowded-image33-freight/`.
Original compound tests retain all 125 legacy objects/2327 parts/six grips as
383 bodies: `build/blockwalker-compound-{chrome,firefox}-mechanics/`.
Pilot/lifecycle/playground and driver editing/restart checks passed in
`build/blockwalker-driver/cargo-physics.log` and `build/blockwalker-image33-driver/`.

Recovery task `20260925-083000` is open: after compound conversion, East recovers
three crates/fires six times in 2400 s, while West fires its three starting crates
and recovers none. The wide-patrol continuation to 3000 s makes no more progress.
Exact replay: `build/blockwalker-rivalry-wide-patrol-continued/blockwalker-world.json`.
A sensor replay finds East waiting outside its bay observations and West's A*
rejecting its small reachable pocket because it cannot reach a 24 m frontier.
`build/blockwalker-forklift-trucks-stalled-sensors/` and
`build/blockwalker-restock/route-connectivity.mjs` preserve the diagnosis.

Unbundled `build/blockwalker-restock/return-route.js` lets waiting trucks return
home and exhausted local searches take a reachable intermediate point. Continuing
the exact 3000 s save to 3600 s, East returns its stranded load and another
(five jobs/eight shots), 137 objects remain, 45 deliveries/four heavy stores per
island, zero errors/crew contacts/rollovers. West still evades traffic without
recovering: `build/blockwalker-rivalry-return-route-continued/`.
`traffic-route.js` also fails West; `incoming-route.js` reduces West's escape
loops but gets East's loaded truck stuck. Do not promote either. Evidence under
`build/blockwalker-rivalry-{traffic-route,incoming-route}-continued/`.
No guard or cargo has been removed to force success.

New task `20260925-052300`: build a useful winch salvage boat. At 3000 s West
ammo 89 lies at (123.39,-7.78,31.79), ammo 91 at (130.21,-7.68,-34.11), beyond
truck reach. Recover physical seabed cargo, transport and hand off to the land
crew, then prove loader/slinger reuse. Use the generic cable controls and an
ordinary program. Prototype and verify before adding to the catalog.
Rope task `20260925-041500` is closed; salvage has its own completion criteria. Lua/YAML migration and walker limitations remain.

Preserve `.cache/blockwalker-browser-20260915`,
`build/blockwalker-recovery-20260923/` and complete native Pi history.
`build/blockwalker-checkpoint-preservation.mjs` verifies six protected files
(392379755 bytes), twelve other images and thirteen catalog entries. Last pass:
`build/blockwalker-image35-preservation.json`. Disk has about 6 GiB available;
no protected evidence was deleted. Large-session refresh remains separately
tracked in `20260923-200000`.

Compile C inside Dolly. Run one owned disposable browser tree at a time under
`systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0`, with a bounded
`timeout`. Firefox uses `DISPLAY=:1`; Chrome uses Xvfb. Scripts under symlinked
`build/` need Node's `--preserve-symlinks-main`. Upload USTAR archives, and use
unique upload destinations (upload deliberately refuses existing files).
Never request terminal screenshots/text while the game owns the GPU.
Do not deep-assert large buffers; use `assert.ok(actual.equals(expected))`.
Animated water invalidates whole-frame equality for camera checks.
For source-only trials use `scripts/build-source-tar.mjs`; packaging uses
`node scripts/prepare-blockwalker.mjs` then `npm run image -- blockwalker`.
