# Blockwalker checkpoint

Worktree: `/home/daug/dev/dolly/work/gpu-shaders`.
Branch: `codex/blockwalker-playground-20260923`.
The latest user request is a stable checkpoint. Feature work is stopped; keep the
served build fixed. Earlier exploration was scheduled through September25,21:00JST.
No push/deployment or subagents are authorized. Last check:19:58JST.

## Running app

`http://127.0.0.1:9099/blockwalker/`, owned user service
`dolly-blockwalker-preview-20260924.service`; relay9010. Image37 is built and
verified. All disposable browser runs have ended. No active build or test.

The image preserves all94 existing blueprints/placements, updates15 editable
programs (33–38,59/60,63/64,77/78,92–94), and adds the93-part Kaiten cargo carousel
plus3 parcels:98 designs total. Fixes cover scout avoidance, warehouse clearance,
recovery-truck escape, boat hook clearance/navigation, porter departure and
courier descent. There are no engine, ABI or physics-force changes.

Snapshot:234645854bytes, SHA
`31cc3ed395ba166db905b640de9bd0faa1245b7eac416b93600038bafe0d3177`.
Source:22files,1250816bytes, SHA
`8e38c7940494a50d36f0a23578712ff512634ab970eaa7c6509f1f8124b547bd`.
Runtime remains
`d39a823c5863d0b1c8508f0d78e61cfe2408144a9ddaa6ecd57919e320718d72`.
Build:43.0s using the existing runtime; snapshot packaging36.1s.

## Verification

`build/blockwalker-image37-preview{,-firefox}/proof.json`: Chrome/Firefox match
all98 sources/blueprints and restore five saves:125-object format2, original
51-object format1 (retaining16 historic deaths),125-object format5, loaded
carousel and loaded boat. Attachments95→98 and94→91 remain after restoration.
No browser/controller errors or model requests. Existing saves retain their own
programs/designs; fresh worlds receive the new catalog.

`build/blockwalker-image37-performance-firefox/`:118 objects,30s warmup, then
682 frames/15.016s =45.42FPS and15.033 simulated seconds. No errors/deaths.
This is a different population from image36's150-object39.32FPS measurement;
do not claim a like-for-like performance improvement.

`build/blockwalker-carousel-final-view-{chrome,firefox}/`: focused front,
bearing and overhead renders of the loaded93-part machine; inspected.
`build/blockwalker-image37-preservation.json`:6 protected files,392379755bytes,
12 other images and13 catalog entries preserved.

Fresh combined evidence:
`build/blockwalker-compound-regressions-chrome-competition-v5/salvage/`.
1500s,118 objects,23 deliveries, no controller errors/deaths, slinger-crew
contacts or recovery-truck tips. Both slingshots fire5 times. Boat2 pickups/
2 handoffs, minimumup.988549; both89/91 physically pass94→93→88→87 and are fired.
Carousel96/97/98 all delivered,2 handoffs, maximum separation.002994m. Tracked
bipeds minimumup.950918/.961194. Captures remain physical:64 hostile releases,
20 tipped enemies;32 friendly attempts,9 upright releases,3 sustained rescues
(10s above.5up, final>.85up, movement>1m). Other rescue attempts can fail.

**Raw long-run C status is1**, solely the unconditional East storage quota.
East warehouse remains seek in all750 samples and never receives delivered
heavy cargo within48m. West stores one. Do not describe the raw test as passing.
`east-warehouse-availability.json` records the input absence; `checkpoint-
evidence.json` explicitly accepts the verified components plus the separate
loaded-cargo warehouse regression. `competition-proof.json` verifies every
original source/blueprint and chronological handoff chains.

Warehouse evidence: `...-chrome-warehouse-clear-proof/salvage/` runs the exact
1500→1920s obstruction save, changes only77/78, and both jobs increase1→2.
Their sources/blueprints match this checkpoint. Browser status0; all125 original
actors remain,129 final objects/36 deliveries, no errors/deaths/crew contacts.
Courier evidence: `...-chrome-courier-descent/salvage/` compares the same210s save
through450s, changing only59. Baseline also lands but reaches9.519m/s downward;
new controller reaches2.576m/s maximum descent, minimumup.979090, two deliveries.

Earlier component proofs remain under the same regression prefix:
`boat-clearance`, `boat-approach`, `warehouse-recovery-wide`,
`carousel-porter-clearance`, `scout-clear`, `fresh-traffic-v2`.
Their exact findings and limitations are recorded in the closed tatr tasks.

## Remaining work

Keep these separate from this checkpoint; no fixes have been started:
- 195200: West courier60 waits above pickup104 because traffic prevents descent.
- 195201: porter38 later tips near parcel41 after completing6 deliveries.
- 195202: East heavy freight99 stays aboard55, leaving the warehouse without input.
All reproduce in the final competition-v5 world and have tasks in this repo.
The broader biped issue20260915-110000 and large-file transfer issue030600 remain
open. The64MiB file limit is unchanged; in-Dolly zlib compression was a diagnostic
export workaround, not a product fix.

## Safeguards and iteration

Compile C only inside Dolly wasm64. Use one owned disposable browser at a time,
under `systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0` and a bounded
`timeout`. Chrome uses Xvfb; Firefox uses DISPLAY=:1. Node needs
`--preserve-symlinks-main` because build is symlinked. Never call
`__dolly.visibleTerminalText()` while GPU rendering is active.

`build/blockwalker-salvage-combined-browser.mjs` accepts WORLD/CATALOG/FIXTURE/
TRIAL_LABEL/SOURCE/ARTIFACTS environment variables with BLOCKWALKER_ prefixes.
It compiles fixtures inside Dolly, exports small saves even on failure, then
compresses and verifies large traces using the in-Dolly trace-gzip helper.
All prototypes remain under ignored build paths; failed variants are unbundled.

Preserve `.cache/blockwalker-browser-20260915`,
`build/blockwalker-recovery-20260923/`, full native Pi history and other images.
Do not delete cargo, teleport vehicles, weaken enemies or add actor-specific
engine forces. Restore/import existing saved programs unchanged. Package only
verified catalog edits with `node scripts/prepare-blockwalker.mjs` and bounded
`npm run image -- blockwalker`; restart only the owned preview service.
