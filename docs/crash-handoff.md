# Blockwalker checkpoint

Worktree: `/home/daug/dev/dolly/work/gpu-shaders`.
Branch: `codex/blockwalker-playground-20260923`.
Verified checkpoint: `blockwalker-stable-20260926-image41`.
Latest verification and deferred-work notes: `blockwalker-checkpoint-20260926-image41`.
Local app: `http://127.0.0.1:9099/blockwalker/`.
Owned service: `dolly-blockwalker-preview-20260924.service`; relay9010.
The latest checkpoint request retains verified image41. No experimental browser
trial remains active. The fresh flight-defense trial was stopped deliberately
after retaining its1200s save; it did not complete its1800s fixture or export a
final full trace. Log: `build/blockwalker-payload-defense/courier-trial.log`.
Its130-object save preserves all111 originals,23 deliveries and no controller
errors/deaths. Three shots produced three payload-contact events but no powered
magnet ejection. Experimental programs59/60/87 remain unbundled. Broader competition,
ammunition and rescue tasks remain open; this checkpoint is not their completion.
Eleven old Xvfb-only test scopes were stopped during checkpoint cleanup; user
browser processes and profiles were untouched.

## Included

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

Dock paint uses14 paired fixed views of the same119-object save,30s warmup and15s
sampling. Chrome30.38→29.94FPS; Firefox33.55→32.68FPS,121 final objects without
errors/deaths. These samples show slightly lower FPS, not a performance gain.
Evidence: `build/blockwalker-yard-markings/paired-{chrome,firefox}/`.
The image39 engine/cache verification and image40 interception/material evidence
remain recorded in their task history and earlier checkpoint tags.

## Artifacts and rollback

Source tar:1326080bytes, SHA256
`27d9c483faf2063c1eaa57156bd5957f7fba86bc18f6072b01e31b7af6e831be`.
Snapshot:234720943bytes, SHA256
`1e6b215f5fdd3979ec84b3984065b6e8e9fa84035018f70bb9499631a5972c12`.
Runtime build identity (not raw Wasm hash), unchanged:
`sha256:d39a823c5863d0b1c8508f0d78e61cfe2408144a9ddaa6ecd57919e320718d72`.

Previous image40 source tar, snapshot and metadata are preserved under
`build/blockwalker-image40-fallback/`. Implementation tag:
`blockwalker-checkpoint-20260926-image40` (300d656); notes:
`blockwalker-stable-20260926-image40` (60a3965).
Image38/39 fallbacks remain. Never replace the preserved user saves during rollback.

## Open follow-ups

- 20260926-000614: sustained battery supply remains too slow after one reload.
- 20260925-205300: target-preserving dozer program fails its120s rescue gate, but
  gets all three magnets onto73 and begins lifting at1797.117s, only2.88s before
  the trial ends. Both branches retain121 actors without errors/deaths/friendly
  impacts; guard remains inverted and gun91 unfired. Evidence:
  `build/blockwalker-compound-regressions-chrome-rescue-target/salvage/`.
  Next prepared, not run: `build/blockwalker-rescue-dozer/held-continuation.c`,
  using target-grip-catalog.json and that trial's guard-candidate.json. It runs60s
  from1800, records dozer sensors each second and requires physical righting plus
  firing91. Measure this actual lift before changing actuator forces or design.
- 20260926-044300: payload-defense research. Channel900s diagnostic sees no loaded
  enemy because59 stalls on traffic. Yard600s trial hits light121 at13.102m/s but
  it stays attached and is delivered. Matched300→420s faster throw hits heavy80 at
  19.246m/s but likewise does not detach it. Both branches normally release80 at
  the depot with magnet power0. Matched420→540s light test gets no shot: tender111
  collects121 before the aircraft. That is competing retrieval, not a deadlock.
  Evidence: `...-chrome-payload-{yard,energy,light}/salvage/`; full traces retained.
  The channel diagnostic and latest fresh trial were stopped without final full
  traces; their progress saves remain. The latter's natural armed light-payload
  save is `...-chrome-payload-couriers/salvage/progress-defense-light.json` at
  466.017s. Prepared `precision-comparison-catalog.json`/`payload-comparison.c`
  can replay it without placing cargo or altering opponents. Unrun.
  Do not claim air denial from hits alone.
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
  Input: image41's battery-incremental-fresh progress-chain-0900.json. Unrun.
- 20260925-195201: porter38 climbs carousel95's anchored base; candidate unsafe.
- Biped20260915-110000 and transfer030600 remain open. The64MiB file download limit
  is unchanged; trace compression remains a diagnostic workaround.

## Iteration safeguards

Compile C/C++ only inside Dolly wasm64. Use one disposable browser at a time under
`systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0` with a bounded timeout.
Chrome uses Xvfb; Firefox DISPLAY=:1. Node needs `--preserve-symlinks-main` because
build is symlinked. Never call `__dolly.visibleTerminalText()` while GPU is active.

Preserve `.cache/blockwalker-browser-20260915`, `build/blockwalker-recovery-20260923/`,
native Pi history and other images. Disk has about4.8GiB free; no unrelated cleanup.
The salvage harness accepts BLOCKWALKER_SOURCE/CATALOG/FIXTURE/WORLD/TRIAL_LABEL/
ARTIFACTS. `build/blockwalker-progress-browser.mjs` exports periodic live saves.
Source iteration uses build-source-tar without changing recipe pins. Package
verified changes with `node scripts/prepare-blockwalker.mjs` and bounded
`npm run image -- blockwalker`; restart only the owned preview. No push/deploy.
