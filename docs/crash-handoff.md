# Blockwalker checkpoint

Worktree: `/home/daug/dev/dolly/work/gpu-shaders`.
Branch: `codex/blockwalker-playground-20260923`.
Checkpoint: image40, tag `blockwalker-checkpoint-20260926-image40`.
Local app: `http://127.0.0.1:9099/blockwalker/`, owned user service
`dolly-blockwalker-preview-20260924.service`; relay9010.
The checkpoint request is complete. The broader goal has resumed through
2026-09-26 13:00 JST. Active fresh combined test: session37413, scope
run-rc40a4a38614e48608a8040abb31e369c.scope,2400s wall timeout. Log: build/blockwalker-battery-supply/fresh-incremental.log.
Poll before starting another browser; do not edit its frozen inputs.
Served image40 and its source archive are unchanged. Canonical scene.wgsl now
includes the verified, still unbundled dock-edge paint.
Playable implementation tag: `blockwalker-checkpoint-20260926-image40` (300d656).
Checkpoint notes tag: `blockwalker-stable-20260926-image40`.
New controller experiments remain under build; image40 stays playable.

## Included

All111 designs remain, with terrain4's covered freight shed, slag terraces,
stepped shores, northern boat inlet and channel flak battery. The battery uses
ordinary3×3 turntables, magnets, motors and an editable aiming program. Captures
and teammate rescues remain. No actor-specific forces or physics timing changes.

Compared with image39, only catalog entry106's program and ground/shore materials
change. Every blueprint and the other110 programs are identical. The gun refines
interception timing, permits descending shots and retains friendly clearance.
Materials add moss, patched concrete, broken seams and tide stains; no geometry
changes. Existing saves retain their own terrain and programs; the updated gun
program applies to fresh worlds. Controller/terrain caches from image39 remain.

Source:22 files,1,320,448 bytes,
SHA `35ae1a694cd7902249ccc0e1e00cdd133a591c6bf0fee0140515e9d0092321c7`.
Snapshot:234,714,979 bytes,
SHA `03d86146979ee1261e941a93a5161137a61b74407b50bcf052e560d1ee174cfd`.
Runtime build identity (not the raw Wasm file hash), unchanged:
`d39a823c5863d0b1c8508f0d78e61cfe2408144a9ddaa6ecd57919e320718d72`.

Rollback: `build/blockwalker-image39-fallback/` contains the previous source tar,
snapshot and snapshot metadata. Image39 implementation tag:
`blockwalker-checkpoint-20260925-image39` at07967f6; its notes are also tagged
`blockwalker-stable-20260926`. Earlier image38 fallback remains intact.

## Verification

Image40 builds inside Dolly wasm64 in44.7s, reusing the existing runtime and all
12 dependencies. `build/blockwalker-image40-build.log` records the build.
Packaged Chrome and Firefox checks pass all111 catalog entries and six saved
worlds, including original format1 and terrain4. Historical deaths are preserved;
no new controller/browser errors or model requests. Saved cargo98→carousel95
and91→boat94 retain actual magnet attachments. Rendered views inspected.
Evidence: `build/blockwalker-image40-preview{,-firefox}/proof.json` and images.
Rerun locally with `bash build/blockwalker-image40-verify.sh`.

`build/blockwalker-image40-preservation.json` verifies six protected files
(392,379,755 bytes),12 other images and13 catalog entries. All40 recipe lint checks
pass. Preserved user state includes full native Pi history and the recovered world.

The aiming change passes a matched attached-round replay: original0 intended-aircraft
hits, candidate2, no friendly airborne impacts. Fresh populated verification has
three starting rounds hit their intended aircraft,13 buffered impacts total,
no friendly airborne impacts, no controller errors/deaths over1800s. These are
hits, not proven shootdowns. The fresh run fails its freight/resupply quotas;
that failure is not presented as an overall gameplay pass. Reproduction and
measurement corrections: `tasks/20260926-005230-codex-01/TASK.md`.

Materials use14 paired fixed views of the same119-object300s save. Chrome measures
30.40→30.73FPS; Firefox33.89→33.98FPS after30s warmup and15s sampling. Both finish
with121 objects and no errors/deaths. Approximately unchanged performance, not a
universal FPS guarantee. Evidence: `build/blockwalker-ground-materials/`
`bundle2-{chrome,firefox}/`.

Image39 engine verification still applies: the complete playground fixture plus
fresh300s run passes;119 objects,8 deliveries,2 shots/hits, no errors/deaths.
Its saved state exactly matches the uncached baseline and12 fixed renders are
byte-identical. Matched Firefox119-object run improves23.94→32.85FPS while
physics stays60Hz/8 substeps. Evidence: `build/blockwalker-compound-regressions-`
`chrome-checkpoint39a/salvage/` and `build/blockwalker-world-renewal/cache2-firefox/`.
The old35s lookout deadline failed equally before/after caching; the60s allowance
retains its distance, stability and contact assertions.

## Checkpoint confirmation

Firefox boots all111 bundled designs and restores the newest1440s handoff replay
with131 objects, unchanged programs/blueprints, no errors or deaths. Fresh and
restored views inspected. Evidence:
`build/blockwalker-stable-image40-preview-firefox/proof.json`.
Source tar, snapshot and raw Wasm served at9099 match the local artifacts; both
runtime build identities were recomputed. Evidence:
`build/blockwalker-stable-image40-artifacts.json`.
Protected user state and the other12 images still match the earlier baseline:
`build/blockwalker-stable-image40-preservation.json`.

## Open follow-ups

The broader world/competition task20260925-221800 remains open. Image40 does not
establish balanced competition, shootdowns, sustained ammunition supply or heavy
cargo reaching both island warehouses. Existing saves preserve their programs.

- 20260925-195200: courier60 yielding passes isolated replay; unbundled.
- 20260925-195201: porter38 climbs carousel95's anchored base; candidate unsafe.
- 20260925-195202: diagonal truck route passes300s, but combined freight fails.
  The crane rejects a pallet whose center is too close, although its edge is reachable.
  `crane-edge-grasp.js` passes the exact jam replay:112→54→55 and116→54. Fresh
  sustained storage is still unverified.
- 20260925-205300: inverted guard73 blocks loaded gun87. Existing forks lift it
  but cannot right it. Wheel drive clears the gun, which fires91, without
  recovering the guard. Neither candidate passes rescue requirements. Keep the
  friendly clearance and teammate rescue behavior; prototype dozer is untested.
- 20260926-000614: combined1800s `battery-diagonal-drop` fails:134 objects,
  29 deliveries,4 shots/1 outside-supplied shot, zero warehouse jobs, no losses or
  errors. Supported ammunition125 waits hundreds of seconds for overly narrow
  drop alignment. Rectangular tolerance passes the exact1200→1440s replay:
  125→107→106→shot, alongside the crane fix;131 objects, no losses/errors.
  This proves those handoffs, not sustained operation or that new shot's impact.
- Biped20260915-110000 and transfer030600 remain open. The64MiB file download
  limit is unchanged; trace compression remains a diagnostic workaround.

Latest physical evidence lives in `build/blockwalker-compound-regressions-`
`chrome-{battery-diagonal-drop,handoff-recovery,guard-righting,guard-traction}/salvage/`.
Full failed runs and progress saves are preserved. Each issue records the result.
In guard-traction, progress files named1560 contain world.seconds1590; use the
embedded time. The denser-ammunition test is inconclusive and remains unbundled.

Latest fresh combined test `battery-handoff-fresh` failed at266.283s when barge55
exceeded its controller budget. It had loaded112 and departed:119 objects,
7 deliveries, no losses. Its escape loop sampled48×8 collision paths per update.
`freighter-incremental.js` samples one candidate each update with the same depth
and cost predicates; interpreter limits and physics stay unchanged.

`freighter-budget` replays180s from that stopped state. Both old and new programs
clear the obstruction, retaining112; the error does not recur after restarting
the old controller. Candidate final(131.931,92.664), minimum up0.956567,
no errors/deaths/missing originals. Raw fixture1 also includes an invalidz>115
assertion: both boats had already turned south along their normal route. Preserve
the raw result; neither claim an overall pass nor diagnose that progress as a jam.

Active fresh combined inputs:
`build/blockwalker-battery-supply/{freighter-incremental-catalog.json,fresh-handoff-progress.c}`.
Use `build/blockwalker-progress-browser.mjs`, which exports300s checkpoints.
The previous handed-off pallet and supply fixes still need sustained validation.

The first recovery-dozer trial rights71 for90.40s after release, but cannot right73
or clear gun87.122 objects, no errors/deaths/missing originals, min dozer up0.84836.
One100N magnet catches73's wheel20 and loses it during lift. The grip-strength
and slower-lift variant again rescues71 (73.45s upright), but never grips73;
121 objects, min dozer up0.98439, no errors/deaths. Its program repeatedly replaces
rescue target73 with an incidental grip on opponent72 and retreats.

Next prepared rescue test, not run: `build/blockwalker-rescue-dozer/`
`{target-grip-catalog.json,target-replay.c}`. Input:
`build/blockwalker-compound-regressions-chrome-rescue-grip/salvage/progress-dozer-1680.json`.
The new program keeps the selected teammate and releases unwanted individual
magnet grips. Paired120s old/new replay changes only dozer118's program; require
actual73 attachment,10s upright after release, and gun87 firing91 without friendly
impacts, actor losses or errors. All opponents and physical bodies stay live.
Evidence from earlier runs: `build/blockwalker-compound-regressions-`
`chrome-rescue-{dozer,grip}/salvage/`. Both earlier trials remain failures overall.

Dock/platform stripes now pass Chrome and Firefox with inspected harbor/inlet
views.14 fixed views of the same119-object save,30s warmup/15s sample:
Chrome30.38→29.94FPS, Firefox33.55→32.68FPS,121 final objects without errors/deaths.
These are slightly lower rates, not a performance improvement. Eight shader
lines are in source, not the served image. Evidence:
`build/blockwalker-yard-markings/paired-{chrome,firefox}/`.

## Safeguards and iteration

Compile C only inside Dolly wasm64. Use one disposable browser at a time under
`systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0` with a bounded timeout.
Chrome uses Xvfb; Firefox DISPLAY=:1. Node needs `--preserve-symlinks-main` because
build is symlinked. Never call `__dolly.visibleTerminalText()` while GPU is active.

Preserve `.cache/blockwalker-browser-20260915`,
`build/blockwalker-recovery-20260923/`, native Pi history and other images.
The salvage harness accepts BLOCKWALKER_ SOURCE/CATALOG/FIXTURE/WORLD/TRIAL_LABEL/
ARTIFACTS variables. Source iteration uses build-source-tar without modifying
recipe pins. Package verified changes with `node scripts/prepare-blockwalker.mjs`
and bounded `npm run image -- blockwalker`; restart only the owned preview.
