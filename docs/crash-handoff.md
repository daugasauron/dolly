# Blockwalker checkpoint

Worktree: `/home/daug/dev/dolly/work/gpu-shaders`.
Branch: `codex/blockwalker-playground-20260923`.
Verified checkpoint: `blockwalker-stable-20260926-image41`.
Local app: `http://127.0.0.1:9099/blockwalker/`.
Owned service: `dolly-blockwalker-preview-20260924.service`; relay9010.
No disposable simulations remain active. Eleven orphaned Xvfb-only test scopes
were stopped; user browser processes and profiles were untouched.
The checkpoint request is complete. The broader competition goal remains open.

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
- 20260925-205300: inverted friendly73 can obstruct loaded gun87. Dozer prototypes
  physically rescue71 but have not rescued73 or cleared the gun. Preserve opponents
  and friendly clearance. Prepared target-preserving replay, not run:
  `build/blockwalker-rescue-dozer/{target-grip-catalog.json,target-replay.c}` from
  `build/blockwalker-compound-regressions-chrome-rescue-grip/salvage/`
  `progress-dozer-1680.json`. It changes only dozer118's program in a paired120s
  replay; requires actual73 attachment,10s upright after release and87 firing91.
- 20260925-221800: useful air denial and competition balance remain unproven.
  Prepared payload-targeting gun, not run:
  `build/blockwalker-payload-defense/{catalog.json,slinger.js,defense.c}`.
  Require real projectile contact followed by cargo grip loss aloft; no forced
  detach, damage rule or special forces. Maximum1800s, periodic300s saves.
- 20260925-195200: courier60 yielding passes isolated replay; unbundled.
- 20260925-195201: porter38 climbs carousel95's anchored base; candidate unsafe.
- Biped20260915-110000 and transfer030600 remain open. The64MiB file download limit
  is unchanged; trace compression remains a diagnostic workaround.

## Iteration safeguards

Compile C/C++ only inside Dolly wasm64. Use one disposable browser at a time under
`systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0` with a bounded timeout.
Chrome uses Xvfb; Firefox DISPLAY=:1. Node needs `--preserve-symlinks-main` because
build is symlinked. Never call `__dolly.visibleTerminalText()` while GPU is active.

Preserve `.cache/blockwalker-browser-20260915`, `build/blockwalker-recovery-20260923/`,
native Pi history and other images. Disk has about1.7GiB free; no unrelated cleanup.
The salvage harness accepts BLOCKWALKER_SOURCE/CATALOG/FIXTURE/WORLD/TRIAL_LABEL/
ARTIFACTS. `build/blockwalker-progress-browser.mjs` exports periodic live saves.
Source iteration uses build-source-tar without changing recipe pins. Package
verified changes with `node scripts/prepare-blockwalker.mjs` and bounded
`npm run image -- blockwalker`; restart only the owned preview. No push/deploy.
