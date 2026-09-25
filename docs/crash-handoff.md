# Blockwalker checkpoint

Worktree: `/home/daug/dev/dolly/work/gpu-shaders`.
Branch: `codex/blockwalker-playground-20260923`.
Checkpoint: image40, tag `blockwalker-checkpoint-20260926-image40`.
Local app: `http://127.0.0.1:9099/blockwalker/`, owned user service
`dolly-blockwalker-preview-20260924.service`; relay9010.
The latest user request is a stable checkpoint. Continuous experimental work is
paused at that request; no disposable browser or simulation is running.
Playable implementation tag: `blockwalker-checkpoint-20260926-image40` (300d656).
Checkpoint notes tag: `blockwalker-stable-20260926-image40`.
The source and image remain image40; newer experiments are retained under build.

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

The next fresh combined test is prepared, not run:
`build/blockwalker-battery-supply/{handoff-recovery-catalog.json,fresh-handoff-progress.c}`.
Use `build/blockwalker-progress-browser.mjs`; its progress downloads were verified
in real Dolly runs. It exports300s saves during simulation rather than only at exit.
The existing salvage harness and final artifact export remain available.

Yard edge stripes finish Chrome comparison30.38→29.94FPS without errors, but need
visual review and Firefox verification. They remain outside image40. Evidence:
`build/blockwalker-yard-markings/paired-chrome/`. The rescue dozer under
`build/blockwalker-rescue-dozer/` is untested; change the added ballast's finish2
(glow) to finish3 (stripe) before testing. No new prototypes enter this checkpoint.

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
