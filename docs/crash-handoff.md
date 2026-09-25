# Blockwalker checkpoint

Worktree: `/home/daug/dev/dolly/work/gpu-shaders`.
Branch: `codex/blockwalker-playground-20260923`.
Checkpoint: image39, tag `blockwalker-stable-20260926`.
Game implementation:07967f6 (`blockwalker-checkpoint-20260925-image39`).
Local app: `http://127.0.0.1:9099/blockwalker/`, owned user service
`dolly-blockwalker-preview-20260924.service`; relay 9010.
No push/deploy requested. The user requested a stable checkpoint; image39 stays
served. Active continuation: battery-freight-fresh session61252, fresh world with
five candidate programs; poll before starting another disposable browser.
Latest confirmed progress:1200 simulated seconds,4 shots (1 external chain),
1 tender job,0/0 warehouse jobs,22 deliveries, no deaths. Scope
`run-r1847ad960a934ac6b07d6a37ea61bdb7.scope` is active. Full run maximum1800s;
log `build/blockwalker-battery-supply/fresh-chain.log`. This is not a passing run.

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

Supply investigation: `tasks/20260926-000614-codex-01/TASK.md`, with local candidates
and fixtures in `build/blockwalker-battery-supply/`. None are bundled. The baseline
stops after three starting rounds; the first pickup fix delays the gun by blocking
its swing. Generic radio coordination removes that hold. Bay rechecking and full
vehicle terrain clearance eventually let tender111 deliver scrap101, but at1500s
the shuttle has not collected it and the gun still has only three shots. The raw
test fails;134 objects,26 deliveries, no losses/errors. Continue from that saved
world to investigate the tender→shuttle request/handoff before promoting changes.
The next1500→1800s replay passes the first outside-ammo chain:101→107 at1510.8,
→106 at1549.85, shot at1574.22. No hostile/friendly projectile contacts; nearest
courier59 distance2.374m.136 objects,28 deliveries, no losses/errors; tender jobs2.
Fresh combined validation now runs from `fresh-chain-{catalog.json,c}` with only
actors53,55,56,106,111 changed. It requires two supplied shots and both warehouses
receiving heavy cargo, with all original actors preserved. Fine-aim prototype is
prepared separately but untested; do not mix it into this run. After this browser
exits, the matched aiming comparison uses `fine-aim.c`, `intercept-catalog.json`
and `...-chrome-battery-external-round/salvage/external-gun.json`; export
`aim-baseline.json,aim-candidate.json`. It runs90s per variant. Task005230 tracks
its release-direction/precision hypothesis; no verified hit yet.
`terrain-contact.c` now confirms rear wheel17 against the slag terrace centered
at(43,.25,17),113 samples and maximum677N. A separate three-program freight-chain trial is prepared under
`build/blockwalker-freight-chain/` but has not run.

Preserve captures and teammate rescues. Do not remove actors/cargo or weaken
opponents to satisfy quotas. Improve sustained supply, ammunition recovery,
air-defense effectiveness and balanced competition next.

- 195200: courier60 blocked-pickup yielding passes isolated replay; unbundled.
- 195201: porter38 still climbs carousel95's anchored base; candidate not safe.
- 195202: freighter55 lateral escape and hauler53 reverse recovery each pass
  their exact jams; both need fresh combined verification before promotion.
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
