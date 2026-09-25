# Blockwalker handoff

Work only in `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-playground-20260923`. Active goal: continue current issues
and make the world more lively through September 25, 21:00 JST. Do not complete
the goal at an intermediate checkpoint. No push/deployment or subagents.
Last time check: September 25, 16:14 JST.

## Served checkpoint

`http://127.0.0.1:9099/blockwalker/`, owned user service
`dolly-blockwalker-preview-20260924.service`, relay 9010. Image 36 is built,
served and verified; local commit is next. C compilation inside Dolly: 42.1 s.
Snapshot 234604277 bytes, SHA
`aaa757c571d6f3234e0a52570f9ecc7d9f2c50f0a66f3349e08e75af3cc45c38`.
Source 22 files, 1209344 bytes, SHA
`416212ed525c86b09cb838cfb66ff8794e6c97245d6bfeb1d6cfddf8d1988147`.
Runtime unchanged:
`d39a823c5863d0b1c8508f0d78e61cfe2408144a9ddaa6ecd57919e320718d72`.

Chrome/Firefox packaged checks match all 94 blueprints/programs and restore
125-object format-2, original 51-object format-1 (retaining sixteen historic
deaths), and 125-object format-5 saves with no new errors/deaths/model requests.
`build/blockwalker-image36-preview{,-firefox}/proof.json`.
The warmed packaged Firefox sample reaches 39.32 FPS (591 frames/15.032 s,
15.017 simulated seconds, 150 objects) after 30 s warmup, no errors/deaths:
`build/blockwalker-image36-performance-firefox/`. Screenshot inspected.
Preservation passes: `build/blockwalker-image36-preservation.json`.

The broad-slinger request is complete in `56f29b7` (task 20260925-080000):
1x1..4x4 bearings weld both mounting faces; both crews use two 3x3 bearings,
open masts, exposed rotors/counterweights and retracting pedestals. Loaders
sit 16 m away. Compound bodies/SIMD are in `0b95170` and preceding commits.
Image 35/`6f70ace` added winch kind 8, slack distance/finite reel force,
1..24 m cable, world format 5 persistence and static-piston restore fix.
Canonical bearing/winch/old-save checks: `build/blockwalker-image35-canonical-proof/`.
Cable renders sag but does not wrap/collide with geometry.

Image 36 preserves all 93 designs, changes four programs (warehouse 77/78,
recovery truck 92/93) and appends the 131-part Umibozu cable salvage boat.
No engine/ABI changes. New boat has long double-height pontoons, 3x3 bearing,
rotating ballast, eight-block boom and weighted magnet on a 12 m winch.
It uses ordinary jets, keys and observations. Slow slew settles before travel;
pickup checks hull clearance; release requires actual load alignment/support.
Truck routing now matches its existing enemy escape clearance and can return
home from outside bay observations. Warehouse planning spreads work across
callbacks at the unchanged budget; ungripped chassis cargo triggers a brief
physical shed maneuver before normal pickup. Tasks 20260925-052300, 083000,
061503 and 070046 are closed with packaged evidence.

## Evidence and exact continuations

Prototype files: `build/blockwalker-salvage/`.
`generate.py` + `controller.js` -> `candidate.json`; `full-catalog.json` is the
promoted final 94 catalog. `warehouse-bounded.js` includes final shed behavior;
`warehouse-shed-updates.json` updates 77/78. `guard-clearance.js` is canonical
truck program. `startup-crew-updates.json` includes final boat startup correction;
older `safe-crew-updates.json` does not. Do not overwrite with an older prototype.

All trial folders below have prefix
`build/blockwalker-compound-regressions-chrome-salvage-` and `/salvage/` outputs.
- `shore-populated`: adds boat to 134-object t=3000 save, stops at 3154.6 on
  old warehouse 78 budget failure; boat upright/loaded. Preserve failure.
- `warehouse-resumed`: exact failed world, only warehouse program update,
  600 s -> 143 objects/50 deliveries; boat 91 -> shore -> truck 93, retrieves 89.
- `return-route`: failed branch, boat rolls lifting beside Quayfin; truck's
  route/escape clearance still disagrees. Not a completion pass.
- `safe-clearance`: resumes upright 3754.6 save, only trucks+boat updated;
  600 s -> 149 objects/56 deliveries, no errors/deaths/crew contacts/truck tips.
  Both warehouses five stores, East shots 6->8, West 3->5. Both rounds 89/91
  complete boat -> shore -> truck -> loader -> slinger -> fired. Boat min up
  .987748. `relay-proof.json` checks chains across explicit update continuations.
- `empty-slew`: final boat startup, 300 s empty patrol+reopen, min up .910553.
- `safe-interrupted`: final boat, deep -7.7 m pickup, loaded reopen/manual
  magnet-off, two pickups/one shore handoff, min up .989881, joint error .002953 m.
- `fresh-slew`: fresh final boat catalog, 1200 s, 119 objects/25 deliveries,
  no errors/deaths/crew contacts/truck tips. Boat pickup/handoff 1/1, East
  recoveries 4/shots 7, West 2/5. Returns 1 ONLY for East warehouse zero stores;
  pallet 95 rests on rear chassis, magnet off. All other requirements pass.
- `warehouse-shed`: exact t=1200 continuation, ONLY warehouses updated;
  300 s -> 125 objects/31 deliveries, no errors/deaths/crew contacts/tips.
  Pallet 95 leaves chassis, is picked and stored at (174.114,4.485,34.440),
  East first store at 1314 s. Both warehouses >=1. This is NOT a single
  uninterrupted 1500 s final-candidate trial.

Chrome/Firefox loaded boat and final populated render inspections also pass:
`build/blockwalker-salvage-view-{chrome,firefox}/`. No model calls.

## Next issue

**20260925-071013 is OPEN**: after storing 95, warehouse 77 stalls on next pallet
104, alternating route_pick/unstick from 1387..1500 s. Exact input:
`build/blockwalker-compound-regressions-chrome-salvage-warehouse-shed/salvage/blockwalker-world.json`.
Root (155.420,4.698,33.138), pickup approach (155.969,35.461), yaw -2.356,
current waypoint (155.413,35.073), distance ~2.07, heading error .00584.
Cargo 104 delivered/unheld at (150.556,5.485,30.712).
Inspect actual contacts and wheel/floor sensors before changing behavior.
Possible front overhang versus width-only clearance is an UNVERIFIED hypothesis.
No cargo removal/movement, weakened guards, or regression of chassis recovery.
Continue active goal after the local image36 commit.

## Iteration and safeguards

No disposable browser is running; all prior exec handles consumed.
`build/blockwalker-salvage-combined-browser.mjs` accepts BLOCKWALKER_WORLD,
CATALOG, FIXTURE, TRIAL_LABEL, SOURCE(optional dist archive). Compiles C inside
Dolly using `build/blockwalker-fixture-cache.mjs`. It prints sparse live progress
from the physics-only terminal after checking GPU inactive; saves regression.log,
salvage.jsonl and world even on failure. Loaded/dock downloads require status 0.
`warehouse-shed.c` is the latest 300 s continuation fixture. `analyze.py FOLDER
BASELINE UPDATES_JSON` checks preservation and actual relay transitions.

Compile C ONLY inside Dolly wasm64. One owned disposable browser tree at a time,
under `systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0`, bounded
`timeout`. Firefox DISPLAY=:1, Chrome Xvfb. Node `--preserve-symlinks-main`
(build is symlinked). Never use `__dolly.visibleTerminalText()` while game owns
GPU. Physics-only fixtures may use terminal text. Upload USTAR to unique paths.
No native fallback, teleports, removed cargo, weaker guards or actor-specific
engine behavior. Ordinary editable programs only. Existing saves retain their
own blueprints/programs; fresh worlds get new catalog.

Package only a verified source checkpoint: `node scripts/prepare-blockwalker.mjs`,
bounded `npm run image -- blockwalker`, restart ONLY owned preview service.
`build/blockwalker-image36-browser.mjs` accepts saved worlds and
BLOCKWALKER_BROWSER=firefox; it checks `.controllerError` correctly. Performance
harness `build/blockwalker-image36-performance.mjs` uses the packaged binary;
old rivalry-view harness has obsolete SIMD/source overrides, do not use it.

Preserve `.cache/blockwalker-browser-20260915`,
`build/blockwalker-recovery-20260923/`, full native Pi history and other images.
`build/blockwalker-checkpoint-preservation.mjs OUTPUT` checks six protected files
(392379755 bytes), twelve other images, thirteen catalog entries. Disk ~5.9 GiB
available; no protected evidence removed. Large-session refresh: task 20260923-200000.
