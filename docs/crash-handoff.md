# Blockwalker checkpoint

Worktree: `/home/daug/dev/dolly/work/gpu-shaders`.
Branch: `codex/blockwalker-playground-20260923`.
Local deployment: image43, with deferred environment sensors and a visible FPS badge.
Local app: `http://127.0.0.1:9099/blockwalker/`.
Owned service: `dolly-blockwalker-preview-20260924.service`; relay9010.
Image43 adds task073000 to image42. All111 character designs/programs remain
identical to image41. Navigation, rescue, beam ammunition, tether interception
and quarry-material experiments remain unbundled.

Performance verification uses `build/blockwalker-performance-20260926/`.
The same134-object world produces identical complete saves/controller memories
in baseline and candidate after1800 physics steps. Retained sensor values,
terrain/obstacle aliases, assignment/deletion and repeated frozen reads pass;
720 samples across all five terrain versions match. All C compiles inside Dolly.
Repeated stock/candidate/candidate/stock measurements average5.3% faster in Chrome
(28.19→29.68FPS) and17.6% in Firefox (10.57→12.43FPS). Host load varies substantially;
the earlier36FPS outlier is not the claim. Physics remains60Hz/eight substeps.
The FPS badge updates once per second and stays in the game view when panels
are hidden or Pi is open. It uses the existing frame counter.

The paired battery-shape-route and
battery-shape-follow trials completed; query/steering improvements remain
unbundled. Follow1260→1800s:138 objects in both branches; tender jobs2→4
candidate versus2 baseline, but both4 shots and zero new full reload/fire cycles.
No errors/losses/deaths/friendly impacts. Full traces and final worlds:
`...-chrome-battery-shape-{route,follow}/salvage/`. The read-only collision query
prototype is based on image41; merge only its query addition if promoted, since
copying its world.c wholesale would discard canonical passive-cargo support.

The47-part rotary-shapes rescue variant completed1620→1800s: heavy guard73 stays
inverted; both branches have no errors/losses/deaths/friendly hits. Candidate
spends51s routing and50s backing up. Task205300 records the unsuccessful result;
`...-chrome-rescue-rotary-shapes/salvage/` retains both traces.

An unbundled42-part winch/jet/magnet interceptor prototype is implemented under
`build/blockwalker-tether/` (task071000). Damped45s hover passes with below0.001m
final error, minimum up0.928808 and no sampled self-contact. The low-tower paired
360s trial produces zero captures and11 deliveries in both branches: couriers
cruise at32m, beyond most of this placement's reach. The same tower on the12m
ridge at(88,−55) is prepared but unrun. Do not describe this as working defence.
Task072000 has an unrun quarry-material shader comparison; canonical shader is
unchanged. Performance takes priority over both prototypes.

The payload-beam trial completed its
600s run with125 objects,14 deliveries and no actor losses/errors/deaths, but zero
shots or payload drops. A beam reaches the gun and then loses its grip during
spin-up. Its raw fixture status is1; weapon effectiveness remains unproven. Full trace:
`build/blockwalker-compound-regressions-chrome-payload-beam/salvage/`.
Experimental beam ammunition, rescue and defense programs remain unbundled.
Eleven old Xvfb-only test scopes were stopped during checkpoint cleanup; user
browser processes and profiles were untouched.

## Included

Image43 adds deferred environment sensors and the FPS badge; image42 added
passive multi-box cargo to the image41 changes below.
All111 designs and their blueprints remain. Compared with image40, only embedded
programs53,54,55,56,107,111 change, plus eight previously verified shader lines:

- Hauler53 takes the diagonal approach through the foundry passage.
- Quay crane54 can grasp a reachable pallet edge when its center is out of reach.
- Barges55/56 retain route progress and use normal thrusters for detours.
  Escape planning evaluates one candidate per update within the existing budget.
- Shuttle107 rechecks pickup reach and releases stale out-of-range targets.
- Tender111 uses full-body clearance and aligns while lowering ammunition.
- Broad steel decks have muted, worn yellow/charcoal edge paint.

No engine forces, physics timing, character designs or obstacles change.
Captures, teammate rescues and friendly-fire clearance remain. Existing saves
retain their embedded programs; fresh worlds receive the updated catalog.
Rescue-dozer and payload-defense prototypes are not bundled.

## Verification

Image43 builds inside Dolly in51.5s with the existing runtime/12 dependencies.
Chrome and Firefox pass111 bundled source/blueprint comparisons and seven saved
world restorations, including format1, active magnet attachments and134 actors.
No new errors/deaths/model requests. FPS badge screenshots inspected in normal,
focus and focus-with-Pi layouts. Evidence:
`build/blockwalker-image43-preview{,-firefox}/proof.json` and `fps-*.png`.
All22 archived source files match canonical source; served source/snapshot/Wasm
hashes match. Six protected save/history files and39 other image snapshots are
unchanged; all40 recipe lint checks pass. Evidence:
`build/blockwalker-image43-artifacts.json`. Browser recheck:
`bash build/blockwalker-image43-verify.sh`. No test browser remains running.

Image42 builds inside Dolly wasm64 in48.7s, reusing the runtime and12 dependencies.
Chrome and Firefox each pass111 bundled-source/blueprint comparisons and seven
saved-world restorations, including format1, existing magnetic attachments and
the134-object1800s world. No new errors/deaths/model requests; rendered views
inspected. Evidence: `build/blockwalker-image42-preview{,-firefox}/proof.json`.
All22 archived source files match canonical source; HTTP source/snapshot/Wasm
hashes match. Six protected save/history files and all39 other image snapshots
remain unchanged; all13 catalog entries remain, with only blockwalker updated.
Evidence: `build/blockwalker-image42-artifacts.json` and `image42-before.json`.
The packaged executable also passes the existing cargo regression: passive beams
are cargo, racks/actuators are not; loaded lift/boat movement and11 saved bodies
restore correctly. Evidence: `build/blockwalker-image42-cargo.log`.
Rerun browsers: `bash build/blockwalker-image42-verify.sh`.

Earlier image41 evidence:

Fresh1800s populated simulation:134 objects,31 deliveries, all111 original actors,
zero controller errors/deaths. Both warehouses store two heavy loads. Actual
magnet chains are truck53→crane54→barge55/56→island crane57/58→warehouse77/78.
Loads112,116,120,126 finish delivered, released, stationary and on their islands.
Minimum up: truck0.990412, barges0.926593/0.893361.
Evidence: `build/blockwalker-compound-regressions-chrome-battery-incremental-fresh/`
`salvage/{freight-proof.json,regression.log,salvage.jsonl}` and300s progress saves.
Heavy-freight task20260925-195202 is closed after packaging verification.

The combined fixture still exits1: it requires two outside ammunition reloads,
while only one completes. Four shots produce14 intended-aircraft impacts and
zero friendly impacts. These are hits, not proven shootdowns. Task000614 remains
open. The per-tick C fixture proves125→111→107→106→shot at883.167s; the offline
5s-sampled supply helper misses the short gun grip and reports zero cycles.
Do not present that sampling limitation as a missing physical grip or a second
reload. Full failed result and trace are retained.

Image41 builds inside Dolly wasm64 in46.0s, reusing the runtime and12 dependencies.
`build/blockwalker-image41-build.log` records the build. Chrome and Firefox each
pass111 bundled-source/blueprint comparisons and seven saved-world restorations,
including original format1 and the newest134-object1800s world. Historical deaths
are preserved; there are no new controller/browser errors or model requests.
Saved98→95 and91→94 retain actual magnet attachments. Rendered views inspected.
Evidence: `build/blockwalker-image41-preview{,-firefox}/proof.json` and screenshots.
Rerun locally: `bash build/blockwalker-image41-verify.sh`.

Six protected files (392379755bytes),12 other images and13 catalog entries remain
unchanged, including native Pi history and the recovered user world. All40
recipe lint checks pass. Evidence: `build/blockwalker-image41-preservation.json`.
All22 archived source files match canonical source; served source/snapshot/Wasm
match local hashes and runtime identities recompute correctly. Evidence:
`build/blockwalker-image41-artifacts.json`.

Latest checkpoint recheck: Chrome and Firefox both boot, render four world views,
and export all111 designs with matching programs/blueprints and zero errors/model
requests. Evidence: `build/blockwalker-stable-checkpoint-preview{,-firefox}/`.
Served hashes, all22 source files and six preserved user files were rechecked:
`build/blockwalker-stable-checkpoint-artifacts.json`. No rebuild was needed.

Local deployment recheck also passes Chrome and Firefox:111 fresh designs match
canonical programs/blueprints; the1800s world restores all134 objects with zero
errors/deaths/model requests. Rendered views inspected. Evidence:
`build/blockwalker-local-deploy-20260926-preview{,-firefox}/proof.json`.
Served source/snapshot/Wasm, all22 canonical source files and six protected user
files match the checkpoint: `build/blockwalker-local-deploy-20260926-artifacts.json`.
The existing preview already serves these exact artifacts; no rebuild was needed.

Dock paint uses14 paired fixed views of the same119-object save,30s warmup and15s
sampling. Chrome30.38→29.94FPS; Firefox33.55→32.68FPS,121 final objects without
errors/deaths. These samples show slightly lower FPS, not a performance gain.
Evidence: `build/blockwalker-yard-markings/paired-{chrome,firefox}/`.
The image39 engine/cache verification and image40 interception/material evidence
remain recorded in their task history and earlier checkpoint tags.

## Artifacts and rollback

Source tar:1329664bytes, SHA256
`c040677fec4b3389dfa02ac5f8d76ba3b397055898a927230a6dfb8f256fdbb1`.
Snapshot:234726589bytes, SHA256
`4c9ac28ce45b5f83499b081a3d4782834465ffaaa46d1337b32ee71ededa19ab`.
Runtime build identity (not raw Wasm hash), unchanged:
`sha256:d39a823c5863d0b1c8508f0d78e61cfe2408144a9ddaa6ecd57919e320718d72`.

Image42 source tar, snapshot, metadata, recipes and registry are preserved under
`build/blockwalker-image42-fallback/`. Previous checkpoint tag:
`blockwalker-local-20260926-image42` (375627e).

Image41 source tar, snapshot, metadata and old recipe files are preserved under
`build/blockwalker-image41-fallback/`. Previous checkpoint tag:
`blockwalker-local-20260926-image41` (f4054a5).

Previous image40 source tar, snapshot and metadata are preserved under
`build/blockwalker-image40-fallback/`. Implementation tag:
`blockwalker-checkpoint-20260926-image40` (300d656); notes:
`blockwalker-stable-20260926-image40` (60a3965).
Image38/39 fallbacks remain. Never replace the preserved user saves during rollback.

## Open follow-ups

- 20260925-205300 latest trials: the serial-piston dozer cannot lift73 despite
  three grips. A three-piston parallel crossbar initially collides with its own
  front wheels; wider mounts remove sampled self-contact and rescue71 for278s,
  but only tilt73. A47-part rotary head also rescues71, then gets blocked by72.
  Matched1620→1800s detour programming still fails the heavy rescue; no actor
  losses/errors/deaths/friendly projectile hits. Full traces:
  `...-chrome-rescue-{held,parallel,parallel-wide,rotary,rotary-route}/salvage/`.
  All prototypes remain unbundled. See task205300 for measured constraints.
- 20260926-044300 latest trials: precise aiming and the longer existing channel
  gun geometry hit cargo without breaking its grip. The central-hit60Hz candidate
  hits at23.675m/s, reaches a sampled0.806m magnet gap (break distance1.2m), then
  hits friendly loader107 twice. Reject it. The corresponding20Hz baseline was an
  incorrect assumption: the original gun already runs60Hz. The candidate's failed
  ejection/friendly hits are direct evidence, but this is not a fair tolerance-only
  comparison. `center-60-comparison.c` is prepared, unrun. Full traces:
  `...-chrome-payload-{precision,long-arm,center}/salvage/`.
- 20260926-000614: sustained battery supply remains too slow after one reload.
- Natural armed light-payload replay input remains
  `...-chrome-payload-couriers/salvage/progress-defense-light.json` at466.017s.
  The interrupted channel/courier diagnostics retain progress saves but no final
  full traces. Later completed precision/geometry comparisons retain full traces.
- 20260925-195200: courier60 yielding already passes isolated replay; unbundled.
  Same traffic stall affects59 at900s in the channel diagnostic:122 lies at0.485m,
  while nearby111 holds the courier's clearance altitude at8.505m. Prepared exact
  continuation: `build/blockwalker-payload-defense/channel-courier-defense.c`,
  with channel-courier-catalog.json and channel progress-payload-0900.json; changes
  only59 and requires another delivery as well as gun outcomes. Unrun.
- 20260926-000614 pickup follow-up: tender111 spends1400/1800s routing. Recorded
  900s sensor replay exhausts223 nodes and follows a three-point dead end; increasing
  its grid65 versus45 gives the same result. This is static JavaScript evidence,
  not physical simulation. `recovery-no-dead-end.js` rejects exhausted searches;
  `pickup-replay.c` and no-dead-end-catalog.json are prepared under
  `build/blockwalker-battery-supply/`. Matched900→1260s baseline/candidate, only111,
  require a new physical111→107→106→shot cycle and no losses/errors/friendly hits.
  Input: image41's battery-incremental-fresh progress-chain-0900.json. Completed:
  both branches130 objects,2 jobs,4 shots, zero new cycles/errors/losses/deaths/
  friendly impacts. The candidate remains enclosed by broad crane/loader circles.
  Full trace: `...-chrome-battery-no-dead-end/salvage/`.
- 20260926-062400: collision-bounds queries pass inside Dolly, including body-owner
  grouping,20 visible/108 out-of-range objects, unknown ID and six invalid inputs.
  Exact900s static sensor replay now finds a route through the machinery in34
  expansions/1.7s controller updates, versus223 nodes and no route with broad
  circles. Physical movement is confirmed by the completed paired trials above, but
  sustained reloading and controller performance still need verification.
  `build/blockwalker-collision-sensors/{query-body.log,route-900-space.json}`.
- 20260926-044300: beam spin-up comparison completed277→397s. Aligning before
  spin delays grip loss280.217→289.417s, but both branches have zero shots/hits/
  drops/friendly impacts and both deliver target80. Grip load still reaches100N.
  Full trace: `...-chrome-payload-beam-spin/salvage/`. Raw fixture1; unbundled.
- 20260925-195201: porter38 climbs carousel95's anchored base; candidate unsafe.
- Biped20260915-110000 and transfer030600 remain open. The64MiB file download limit
  is unchanged; trace compression remains a diagnostic workaround.

## Iteration safeguards

Compile C/C++ only inside Dolly wasm64. Use one disposable browser at a time under
`systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0` with a bounded timeout.
Chrome uses Xvfb; Firefox DISPLAY=:1. Node needs `--preserve-symlinks-main` because
build is symlinked. Never call `__dolly.visibleTerminalText()` while GPU is active.

Preserve `.cache/blockwalker-browser-20260915`, `build/blockwalker-recovery-20260923/`,
native Pi history and other images. Disk has about2.9GiB free; no unrelated cleanup.
The salvage harness accepts BLOCKWALKER_SOURCE/CATALOG/FIXTURE/WORLD/TRIAL_LABEL/
ARTIFACTS. `build/blockwalker-progress-browser.mjs` exports periodic live saves.
Source iteration uses build-source-tar without changing recipe pins. Package
verified changes with `node scripts/prepare-blockwalker.mjs` and bounded
`npm run image -- blockwalker`; restart only the owned preview. No push/deploy.
