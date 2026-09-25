# Blockwalker checkpoint

Worktree: `/home/daug/dev/dolly/work/gpu-shaders`.
Branch: `codex/blockwalker-playground-20260923`.
Checkpoint: image39, tag `blockwalker-stable-20260926`.
Served game implementation:07967f6 (`blockwalker-checkpoint-20260925-image39`).
Local app: `http://127.0.0.1:9099/blockwalker/`, owned user service
`dolly-blockwalker-preview-20260924.service`; relay 9010.
No push/deploy requested. The user requested a stable checkpoint; image39 stays
served. Active disposable browser: session96908, `battery-placement-replay`, scope
`run-r181e30c732f5404b98fe86ca2655be17.scope`. Poll before starting another browser.
Log: `build/blockwalker-battery-supply/placement-replay.log`;1500s wall timeout.
All earlier trials are terminal. The preview service remains running.

Unpackaged source changes: only catalog entry106's verified interception program
and `scene.wgsl` ground/shore materials. Other blueprints/programs are unchanged.
Both material browser comparisons pass, with approximately unchanged FPS:
Chrome30.40→30.73; Firefox33.89→33.98. Fourteen paired views use the identical
119-object300s save;121 final objects, no errors/deaths. Evidence:
`build/blockwalker-ground-materials/bundle2-{chrome,firefox}/`.

The broader world/competition goal through 2026-09-26 13:00 JST remains open in
`tasks/20260925-221800-codex-01/TASK.md`. Its remaining gameplay issues are not
closed by this checkpoint.

## Included

Terrain 4 adds a covered freight shed, slag terraces, stepped shores and a northern
boat inlet with a quay. Thirteen additions bring the catalog to 111: six covered
scrap loads, a six-wheel shed loader,87-part channel flak battery,23-part loading
shuttle, three ammunition loads and a six-wheel recovery tender. Every image38
blueprint/program/placement (98 entries) is unchanged. The87-part gun uses ordinary
3×3 turntables, magnets, motors and an editable aiming program; hits are physical.
Existing saves retain their own terrain and programs. New scenery/actors populate
fresh worlds. No actor-specific engine forces or physics timing changes.

Controller-phase bounds/center-of-mass caching and static terrain geometry caching
reduce CPU work. Dynamic ownership, actuator state and velocity remain live;
geometry is refreshed before the next physics step or outside the controller pass.

Source: 1,318,912 bytes, SHA `eab9772d17304b67ef5f5bc6f15ef0fefa8299ee00a51516fe07fc28e10bfeac`.
Snapshot: 234,713,867 bytes, SHA `f382c050e77ecf19fe0676cdd4bb9f00ae7c37d310bd26eccd24cb40df022a66`.
Runtime remains
`d39a823c5863d0b1c8508f0d78e61cfe2408144a9ddaa6ecd57919e320718d72`.
Image38 rollback artifacts: `build/blockwalker-image38-fallback/`, tag
`blockwalker-checkpoint-20260925-image38` at ec58f11.

## Verification

`build/blockwalker-compound-regressions-chrome-checkpoint39a/salvage/`:
full playground fixture (delivery, controllers, sensors, restart, terrain0–4,
water, radio, supply and cargo handoffs), followed by 300s with all 111 designs.
119 final objects, eight deliveries, two shots/hits, no deaths/controller errors.
The complete saved state exactly matches the uncached baseline, including every
pose and controller memory (`checkpoint-proof.json`). All 12 before/after fixed
camera renders are byte-identical. The fixture compiles and runs inside Dolly.

The original 35s lookout deadline fails equally before the cache changes:
farthest z 38.863, minimum up 0.996549, no cargo contacts. At 60s it reaches45.541.
The test keeps its distance/stability/contact requirements with a 60s allowance.
Baseline: `...-chrome-checkpoint39-lookout-baseline/salvage/`; initial failed
full run retained at `...-chrome-checkpoint39/`.

`build/blockwalker-world-renewal/cache2-firefox/`: matched 119-object, 300s save,
30s warmup and 15s samples,23.94→32.85 FPS;121 final objects, no errors/deaths.
World step 15.04→14.53ms; fixed60Hz/8 substeps unchanged. This is one matched pair,
not a universal FPS guarantee. Earlier terrain3/4 pair was32.73→25.59FPS.
Deep profiling has substantial instrumentation overhead; do not use its FPS.

`build/blockwalker-image39-preview{,-firefox}/`: all 111 designs/programs match;
six saves restore (including original format1 with16 historical deaths and
terrain4). Both cargo98→carousel95 and91→boat94 retain actual magnet attachments.
No browser/controller errors or model requests. Build45.0s, packaging38.0s.
`build/blockwalker-image39-preservation.json`: six protected files (392,379,755 bytes),
12 other images and13 catalog entries preserved. Dollyfile lint passes 40 recipes.

2026-09-26 checkpoint recheck: Chrome and Firefox again pass all111 catalog
entries, six saved worlds and both physical cargo attachments, with no browser
or controller errors. Rendered views inspected. Evidence:
`build/blockwalker-checkpoint-20260926-preview{,-firefox}/proof.json`.
Source/snapshot hashes still match above; preservation check again passes in
`build/blockwalker-checkpoint-20260926-preservation.json`. No rebuild was needed.

Component evidence under `build/blockwalker-compound-regressions-chrome-`:
- `renewal-inlet-boat/salvage/inlet-proof.json`: skiff drives 24m into the inlet and
  brakes using thrusters;75s, minimum up 0.975939, no loss/error.
- `renewal-shed-loader/salvage/shed-proof.json`: physical roof→yard transfer of101,
  no loss/error. Its later progress-based alignment timeout also completes a
  transfer in the north-flak prototype; sustained throughput still needs work.
- `renewal-channel-flak/salvage/flak-proof.json`: two loader→gun handoffs, two shots,
  hostile in-flight contacts at 148.833s (cargo110→59,34.18N) and 229.850s
  (109→9,29.09N); no friendly projectile contacts. Hits, not proven shootdowns.
  Earlier northern placements fire no shots and remain failed experiments.

## Open follow-ups

Candidates and fixtures are local under `build/blockwalker-battery-supply/`;
none are bundled. Detailed reproduction and failed variants live in the tasks.
Evidence directories below share `build/blockwalker-compound-regressions-chrome-`
and contain `salvage/` with logs, complete saved worlds and compressed traces.

Supply task20260926-000614: generic radio coordination, bay rechecking and full
vehicle terrain clearance produce one physical outside-ammunition chain in
`battery-external-round`:101→107 at1510.8s,→106 at1549.85s, fired1574.22s.
136 objects,28 deliveries, no losses/errors; tender jobs2. `terrain-contact`
confirms rear wheel17 against the slag terrace at(43,.25,17),113 samples,677N.

Fresh combined `battery-freight-fresh` fails at1800s:130 objects,25 deliveries,
no losses/errors;4 shots,1 outside-ammo chain,1 tender job,0/0 warehouse jobs.
Only53,55,56,106,111 differ from image39. Shuttle107 chooses flying ammunition89
then keeps reaching after it leaves its workspace. Its extended arm obstructs
tender111. `shuttle-recheck.js` requires settled/reachable stock and rechecks
pickup reach. Exact1800→2100s replay changes only107 and passes
(`battery-shuttle-recheck`):101→107→106→shot5, tender jobs1→2, no loss/error.
Fresh combined verification is still needed.

Freight task20260925-195202: `battery-freight-contacts` confirms chassis block15
wedged on the shaft marker,120/120 samples,302N. `hauler-curved-escape.js` checks
short curves for terrain clearance and wheel support, but the actual1800→2160s
replay fails (`freight-curved-escape`):130 objects, minimum up0.999981, no crane
or boat handoff and only the first pickup. It repeatedly moves around the marker
without escaping. Geometry alone did not prove executable movement. Keep this
candidate out of the image; investigate steering/path tracking next.

Further wheel probes show that fixed ordinary motor commands can move the truck,
but position/heading recovery, wheel-offset correction, stronger heading feedback
and an integral controller all fail the exact jam. Task195202 records the results.
The new route candidate keeps the original vehicle and steering program, moving
its crossing fromz74.7 to78 and centering the tunnel route atx−43. This gives its
rear assembly room to turn beyond the pit marker. No terrain/physics changes.

Fresh `battery-freight-apron` is terminal:1800s,131 objects,25 deliveries, no
errors/deaths, three shots, zero supplied shots and warehouse jobs0/0. Its raw1
is a real freight/resupply failure. All three shots do hit their intended aircraft:
13 buffered impacts across110→9,109→59,108→9, no friendly airborne impacts.
That source106 is now canonical; the other combined candidates remain local.

Hauler53 stops on route1 at(-32.917,76.519). `battery-apron-contacts` proves head11
against the foundry wall(-29.5,6.5,82),120 samples,265N; cargo112 also contacts it.
The front assembly cannot reach the square corner atz78. Next untested program:
`hauler-diagonal-route.js`, crossing(-33,71)→(-43,77), then the tunnel. Test a short
fresh crane handoff before another1800s combined run.

Tender111 releases121 at912.067s, but it settles at(73.213,.485,27.549), beyond
shuttle107's z≈27.8 reach. It shifts backward while the truck lowers; placement
ends on support/velocity without checking position. `recovery-align-lowering.js`
keeps wheel alignment active and requires<.1m error/<.08m/s before release.
The active `placement-replay.c` and `placement-replay-catalog.json` first recreate
the fresh scene up to the first lowering phase (expected around909s, limit1000s),
then compare120s of old/new111 from that full save. Require actual cargo→107→106
magnet handoffs; export `unload-before.json`, `placement-baseline.json` and
`placement-candidate.json`. Source inputs are frozen while it runs.

Aiming task20260926-005230: `slinger-intercept.js` refines flight time and permits
descending shots while retaining crew clearance. `fine-aim-events.c` compares
90s from the identical attached-round save (`battery-external-round`'s
`external-gun.json`), using `intercept-catalog.json`. Buffered Box3D hit events in
`battery-intercept-events/salvage/intercept-proof.json` confirm0 intended-aircraft hits
for baseline and2 for candidate, at1568.583/1568.733s,11.09/8.17m/s. No friendly
air hits or errors; minimum target up0.978 versus0.995. This is not a shootdown.
Both final worlds exactly match their uninstrumented trials.

The earlier `battery-intercept` test had an inadequate predicate:347 sampled
hostile contacts were ground unit72, not the intended aircraft59. The premature
user-facing aircraft-hit claim was corrected. Use the buffered-event proof,
and use the fresh multi-shot evidence above for the canonical source change.

Unrun ammunition comparison: `build/blockwalker-dense-ammunition/{impact.c,catalog.json}`,
input `battery-external-round/salvage/external-gun.json`. It uses the same generic
force-limited program in both branches, changing only cargo101's alloy→ballast
material in the candidate. It measures buffered intended hits, target up and
deliveries. Export `aim-baseline.json,aim-candidate.json,aim-candidate-hit.json`
(the last exists only on a candidate hit). No promised shootdown; not bundled.

Preserve captures and teammate rescues. Do not remove actors/cargo or weaken
opponents to satisfy quotas. Improve sustained supply, ammunition recovery,
air-defense effectiveness and balanced competition next.

- 195200: courier60 blocked-pickup yielding passes isolated replay; unbundled.
- 195201: porter38 still climbs carousel95's anchored base; candidate not safe.
- 195202: freighter55 lateral escape and hauler53 reverse recovery each pass
  their original jams; the fresh combined freight chain fails as described above.
- 205300: guard73 blocks gun87 while rescuing71; coordinate traffic while keeping
  captures/rescues and the gun's friendly-fire clearance check.

Older failed combined run: `...-chrome-checkpoint-combined/salvage/` (storage
quotas, West shot quota). Image37/38 fresh1500s run `...-chrome-competition-v5/`
retains all 118 actors and records 23 deliveries, ten shots and sustained rescues,
but raw status 1 reflects missing East warehouse inputs. Separate loaded warehouse
replay passes. Do not call either raw combined failure green.
Candidates/evidence: `build/blockwalker-checkpoint-followup/` and
`build/blockwalker-world-renewal/`, with reproduction details in the tatr tasks.
Biped task20260915-110000 and transfer task030600 remain open. The 64MiB file limit
is unchanged; in-Dolly trace compression is only a diagnostic workaround.

## Safeguards

Compile C only inside Dolly wasm64. Use one disposable browser at a time, under
`systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0` and bounded timeout.
Chrome uses Xvfb; Firefox DISPLAY=:1. Node needs `--preserve-symlinks-main` because
build is symlinked. Never call `__dolly.visibleTerminalText()` while GPU is active.

Preserve `.cache/blockwalker-browser-20260915`,
`build/blockwalker-recovery-20260923/`, full native Pi history and other images.
The salvage harness accepts BLOCKWALKER_ SOURCE/CATALOG/FIXTURE/WORLD/TRIAL_LABEL/
ARTIFACTS variables. Source iteration uses build-source-tar without modifying
recipe pins. Package verified changes with `node scripts/prepare-blockwalker.mjs`
and bounded `npm run image -- blockwalker`; restart only the owned preview.
