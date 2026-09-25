# Blockwalker checkpoint

Worktree: `/home/daug/dev/dolly/work/gpu-shaders`.
Branch: `codex/blockwalker-playground-20260923`.
The latest request is a stable checkpoint. Image38 packages the verified terrain
materials and lighting over image37. No further gameplay candidates are promoted.
The broader cargo/defense/terrain expansion remains open in task20260925-221800;
its earlier overnight schedule is superseded by this checkpoint request.
No disposable browsers remain running. No push/deploy is requested.

## Running app

`http://127.0.0.1:9099/blockwalker/`, owned user service
`dolly-blockwalker-preview-20260924.service`; relay9010. Image38 is built and
verified in Chrome and Firefox.

The image preserves all94 existing blueprints/placements, updates15 editable
programs (33–38,59/60,63/64,77/78,92–94), and adds the93-part Kaiten cargo carousel
plus3 parcels:98 designs total. Image38 preserves every image37 design/program
and adds rust brick, teal steel/water, ochre rock, mossy ground and reduced haze.
Earlier fixes cover scout avoidance, warehouse clearance,
recovery-truck escape, boat hook clearance/navigation, porter departure and
courier descent. There are no engine, ABI or physics-force changes.

Snapshot:234646867bytes, SHA
`c1a43070d0619595e9f3d82930b16600dbdc3dd37ee997dbfaee1e08e70259cd`.
Source:22files,1251840bytes, SHA
`4857602f057791dea22b264f5dd478722e1fcf9fc5ae3b400ec2eb566a2d380e`.
Runtime remains
`d39a823c5863d0b1c8508f0d78e61cfe2408144a9ddaa6ecd57919e320718d72`.
Build:44.4s using the existing runtime; snapshot packaging37.2s.

## Verification

`build/blockwalker-image38-preview{,-firefox}/proof.json`: Chrome/Firefox match
all98 sources/blueprints and restore five saves: two125-object format5 saves,
original51-object format1 (retaining16 historic deaths), loaded carousel and
loaded boat. `attachment-proof.json` verifies95→98 and94→91 after restoration.
No browser/controller errors or model requests. Existing saves retain their own
programs/designs; fresh worlds receive the new catalog.

`build/blockwalker-world-renewal/{chrome,firefox}/`: paired before/after views
from the identical1500-second118-object save, six fixed cameras; inspected.
After30s warmup,15s samples measure32.10→32.63FPS in Chrome and41.79→42.34FPS
in Firefox, without errors/deaths. No observed slowdown; not a proven speedup.

`build/blockwalker-carousel-final-view-{chrome,firefox}/`: focused front,
bearing and overhead renders of the loaded93-part machine; inspected.
`build/blockwalker-image38-preservation.json`:6 protected files,392379755bytes,
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

Keep follow-ups separate from the served checkpoint. Candidates and fixtures are
in `build/blockwalker-checkpoint-followup/`; reproduction/evidence live with tasks:

- 195200: courier 60 abandons a blocked pickup and delivers another parcel in the
  isolated 480s replay; mine porter handoffs recover 4→5. Fresh trial: 6 deliveries,
  one bounded pickup yield, sampled minimum up 0.930387.
- 195201: pickup ignores machine collisions. Retaining moving-machine avoidance
  prevents climbing guard 76's fork in 750→930s, but the fresh trial drives onto
  carousel 95's fixed base at 703s. Actual contacts identify base/cab parts 90–92,
  peak 642 N. The anchored-machine exemption remains unsafe; do not promote it.
- 195202: freighter's reverse recovery regresses waypoints, then it jams beside 94.
  Generic lateral escape passes 2220→2640s: 55→57→77 transfers/stores 99. Fresh trial
  stalls upstream: hauler53's rear wheel17 catches the shaft marker at(-39.7,71.3).
  Checked reverse recovery passes the exact1500→1860s replay:99 moves53→54→55,
  then53 collects103; minimum up.990627, no errors/deaths. Only53's program changes.
  Both fixes still need fresh combined verification before promotion.
- 205300: West gun 87 holds 91 but friendly guard 73 occupies its swing clearance
  while rescuing 71. Keep the safety check and captures/rescues; coordinate traffic.

`build/blockwalker-compound-regressions-chrome-checkpoint-combined/salvage/`:
only 38/55/60 programs change; all 98 designs/placements remain. **Raw C status 1**:
both storage quotas fail and West gun fires 3 rather than 4 times. 117 objects,
20 deliveries, no controller errors/deaths/crew contacts/recovery-truck tips.
All carousel parcels follow 95→38→delivery; separation 0.003654 m. Boat 2 pickups/
2 handoffs, minimum up 0.989353; only 91 completes the crew chain, with no subsequent
shot. Two sustained rescues verified. This is failed combined verification,
not a passing checkpoint. `competition-proof.json` and `followup-proof.json`
record component results; full trace and final world are retained.

The final unchanged porter replay, `checkpoint-porter-combined-observe`, retains
contact-proof.json and pre-incident/first-tip saves under the same run prefix.
All gameplay candidates remain unbundled. The latest hauler proof is in
`build/blockwalker-compound-regressions-chrome-renewal-hauler-transfer/salvage/`
`hauler-proof.json`; candidate and fixture live in `build/blockwalker-world-renewal/`
as `hauler-recovery-budget.js` and `hauler-transfer.c`. Raw C status0.
The first candidate exceeded the controller budget. A subsequent replay physically
worked but failed an incorrect depot-score assertion; the final fixture verifies
the actual intermediate handoff and second pickup instead.

`build/blockwalker-world-renewal/terrain-v4-source/` and `terrain-v4.tar` contain an
unverified freight shed, slag terraces, shore patches and six covered scrap loads.
They are experiments only: the served image still uses terrain3 and98 designs.
Geometry/save compatibility, populated traffic, defenses and cargo balance need
verification before adoption. Ignored build artifacts are local, not in Git.
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
