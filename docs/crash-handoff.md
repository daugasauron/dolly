# Blockwalker checkpoint

Worktree: `/home/daug/dev/dolly/work/gpu-shaders`.
Branch: `codex/blockwalker-playground-20260923`.
Checkpoint: image40, tag `blockwalker-checkpoint-20260926-image40`.
Local app: `http://127.0.0.1:9099/blockwalker/`, owned user service
`dolly-blockwalker-preview-20260924.service`; relay9010.
No push/deploy requested. Image40 is the protected checkpoint. The broader goal
has resumed through2026-09-26 13:00 JST; experiments remain outside the served image.
Active browser: session21814, `battery-diagonal-drop`, scope
`run-r691b5ff024d84172a31f3e66d6262996.scope`,2400s wall timeout.
Log: `build/blockwalker-battery-supply/fresh-diagonal-drop.log`. Poll this handle
before starting another browser. Do not edit its frozen catalog/fixture inputs.

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
Runtime unchanged:
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

## Open follow-ups

The broader world/competition task remains open at
`tasks/20260925-221800-codex-01/TASK.md`. This checkpoint does not claim balanced
competition or sustained freight/ammunition throughput.

- `20260925-195200`: courier60 blocked-pickup yielding passes isolated replay;
  unbundled.
- `20260925-195201`: porter38 climbs carousel95's anchored base; candidate unsafe.
- `20260925-195202`: isolated hauler/boat recovery passes, but fresh heavy freight
  fails. The original route wedges the rear chassis on a shaft marker; the wider
  square route strikes the foundry wall with the front magnet. Diagonal route
  passes fresh300s:112→truck→crane→barge, then pickup116; minimum up0.991456,
 119 objects, no losses/errors. Island storage is under combined verification.
- `20260925-205300`: guard73 blocks gun87 while rescuing71. Preserve rescue and
  friendly-clearance behavior while fixing traffic coordination.
- `20260926-000614`: one outside-cargo→tender→shuttle→gun→shot chain is proven;
  repeat supply is not. The shuttle-reach fix passes its exact jam replay, but
  the combined fresh run leaves ammunition outside shuttle reach. Final matched
  placement test fails: baseline drops badly, candidate never releases in120s.
  Neither reaches the shuttle/gun; no actor losses/errors. The subsequent low-drop
  variant passes the same save:121→107→106,126 objects, no losses/errors.
  All tender/shuttle candidates remain unbundled pending combined verification.
- Biped task20260915-110000 and transfer task030600 remain open. The64MiB file
  transfer limit is unchanged; in-Dolly trace compression is a diagnostic workaround.

Experimental sources/fixtures are retained under `build/blockwalker-battery-supply/`,
`build/blockwalker-checkpoint-followup/` and `build/blockwalker-world-renewal/`.
The denser-ammunition comparison in `build/blockwalker-dense-ammunition/` is
terminal raw0: both alloy/ballast hit twice, no friendly impacts, but effectiveness
is inconclusive. Do not promote it based on hit counts alone.

Current combined inputs: `build/blockwalker-battery-supply/`
`fresh-diagonal-drop-catalog.json` and `fresh-reload-status.c`. Fresh111 actors,
maximum1800s, earliest successful stop1200s; require repeated outside-ammunition
chains, both warehouses, intended hits and no friendly hits/loss/errors. At780s
the truck waits with its second load behind an occupied quay bay; crane54 has
no jobs and both warehouses remain0. Tender111 is lowering outside crate125,
with one earlier job. Inspect the actual cargo/free-boat predicates when the
final world and trace are exported; do not infer the cause from position alone.
The earlier short route test passed, but that is not a combined-world pass.

Next prepared test: `build/blockwalker-guard-recovery/{catalog.json,replay.c}`,
input `...-chrome-checkpoint-combined/salvage/blockwalker-world.json` at1500s.
Guard73 is inverted and disables its actuators. The candidate tries to right it
using existing fork rams; require stable recovery and gun87 firing its loaded91.
Use `build/blockwalker-progress-browser.mjs` for this next test. It adds a
listener for periodic `progress-*.json` downloads emitted by the fixture through
the existing in-Dolly download command. The guard fixture exports each branch
at1560s so snapshots can be inspected while simulation continues. This harness
passes Node syntax checking but has not run in the browser yet. Final exports:
`guard-baseline.json,guard-candidate.json`. The optional
`build/blockwalker-dense-ammunition/impact-detail.c` is also unrun.
Detailed successful and failed evidence paths are recorded in the corresponding
issues. Do not remove actors/cargo or weaken opponents to satisfy quotas.

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
