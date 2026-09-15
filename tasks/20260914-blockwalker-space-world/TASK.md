# Build a larger living world with water, boats and machines

- STATUS: OPEN
- PRIORITY: 300
- TAGS: game,agent,gpu

Continue development until 2026-09-15 22:00 JST. Extend the existing embedded
Pi playground on `codex/blockwalker-20260914`; preserve its learned controllers,
conversation and saved world. Keep the game in C, built inside its one Dollyfile.

Add camera travel, larger terrain, water and physically floating boats. Support
anchored constructions such as cranes and opening bridges alongside larger
walkers, wheeled machines and flying creatures. Give the world a space theme,
dark GUI, visible thrust flames and customizable block designs/effects. Populate
it with varied, moving creations, including randomized feedback controllers.
Use the actual Astra/xhigh Pi agent and timed GPU framebuffer observations.

Verify real browser controls, physics and persistence. Measure boat floatation,
propulsion and steering; anchored mechanisms; controlled flight; and performance
with a populated world. Record evidence here before closing.

## Current checkpoint — 2026-09-15 10:00 JST

Work only in `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-20260914`. Other worktrees/previews belong to other agents.
Do not push, deploy or merge this branch without a new request. Continue the
full goal until 22:00 JST; the checkpoints below do not end the timed work.

Fresh images contain **49 objects/1345 parts**. The live world has **52
survivors/1361 parts** and nine earlier removals: six causes unknown and three
elapsed controller deadlines while upright (Marrowstep 48, Northline 36, Vesper
40). Marrowstep has replacement ID 59; Northline/Vesper designs remain saved.
The [controller fix](../20260915-065100-codex-01/TASK.md) passed finite-controller
pause, runaway, native and browser checks. Full-world restore preserved every
pose, controller memory, tick count and three magnetic attachments.

The latest user priority is [a two-legged walker](../20260915-070100-codex-01/TASK.md).
**Sidelight XXVIII — measured-motion landing damper** now repeats L–R–L–R
stepping in both Pi and an independent unchanged 90 s replay. Actual box-corner
poses confirm airborne feet and four upright forward placements. Torso travel
is 0.79589 m, COM travel 1.06428 m and minimum up=0.97366. It is slow but actually
alternates, with no wheels, jets or anchoring. Source, poses, memory and three
GPU frames are under `build/blockwalker-repeat-trial/`; the seed is
`build/blockwalker-repeat-seed.json`. A 240 s shared-world replay at (60,-50),
plus exact save/reopen, is running in `build/blockwalker-biped-world-browser.mjs`.
No biped is bundled or released yet. Pi's repetition ledger preserved the motion
and identified 56 s of weight transfer; it is testing faster forward progression.

The [joint-stiffness investigation](../20260915-093700-codex-01/TASK.md) is complete.
A temporary 120 Hz constraint build reduced angular bending but regressed
Longwake's navigation. Both 49-object test worlds survived 120 s, demonstrating
why survival alone is insufficient. Keep the current 60 Hz constraints; no game
source or live physics changed. All C compilation was inside Dolly. The complete
comparison is in `build/blockwalker-stiffness-world/` and the issue.

The 00:05 UTC checkpoint preserves the full 324,538,688-byte native history and
all 52 objects. All five selected files matched after normal file-picker import
into the new catalog image; world/history hashes also matched inside Dolly, and
`blockwalker-survey` passed the actual session compatibility check. Pi resumed
actual Astra/xhigh requests. The 00:19:26 UTC mirror reached world time
30700.6333 s with all saved IDs/sources intact and no new removals. The entire
324,538,688-byte history prefix remains unchanged in the growing 325,354,666-byte
file (`survey-continuation-proof.json`). See the service/recovery section and `progress.json`
for newer observations. `build/blockwalker-biped-status.py` prints a bounded,
credential-free summary of the latest mirrored biped work. Do not restart merely because history loading or Astra
inference is slow. An earlier long request ended with `Browser HTTP transport
failed`; Pi's normal retry continued without restart, and its cause is unknown.

**Cairnwing**, **Vesper** and **Rime** are now bundled after measured fresh-start
takeoff, 3.8–5.4 m excursions, return/landing and seeded route variation. Rime's
hydraulic landing legs travel 0.78 m. The larger default world runs at 53–57 FPS
in six full-screen views, alongside the live Pi browser. Physics, save/reload and
focus/camera/prompt checks passed. See the closed
[lander task](../20260915-045200-codex-01/TASK.md) for measurements and GPU images.
Existing first 30 placements remain intact; new initial loads ride Tidelock and
Quayfin. The live world already contains these learned machines and its own cargo,
so it was not reset for this data-only catalog update.

The new [basalt basin](../20260915-051000-codex-01/TASK.md), centered at x46,z72,
adds 21 physical terrain boxes, ledges, open entrances and matte crystal/rock
shaders. The Basin camera button and world-tool coordinates are verified, as are
resting heights, passage, the complete population and browser controls. Old/new
shader runs both measured 32–35 FPS; later old/new terrain runs both measured
54–57 FPS. The shared setup varies, with no substantial basin-specific slowdown
reproduced. The live in-place update is complete; Pi's `watch_world` reports the
new basin coordinate while its existing gantry experiment continues.

The latest [surveyors and salvage machines](../20260915-055500-codex-01/TASK.md)
add five unchanged Pi designs and two loads, retaining the first 35 placements.
Sundial balances while telescoping; Marrowstep walks both directions; Kelpglass
completes its route with adjustable hull spacing. Brinehook and Shoalhook lift,
carry and release independent cargo onto their receiving trays. The 90-second
fresh replay, saved-world reopen and native integration passed. Full-screen
views measured **34–47 FPS**, matching simulation to wall time, with the live
Pi browser also active. Profile the population cost before another large increase;
the shared-host figures alone do not isolate the change from earlier workloads.

The live Kelpglass ID 49 remains near the western island corner on its original
route; its widened hull conflicts with that location. The fresh catalog places
it farther south at -163,-90, where a complete circuit was measured. The existing
live boat was preserved. Brinehook's fresh placement is 205,0 with its own crate,
away from Quayfin; its live original remains 151,-5. Shoalhook ID 51 recovered
existing live crate 50 onto its tray; Pi measured 9 m horizontal recovery and
magnet-off settling. Both cranes also passed independent fresh-start trials.

[World cargo height](../20260915-043000-codex-01/TASK.md) supports explicit new-box
placement on lifts/boats. Transfer between Quayfin and Tidelock remains unproven.
Their live cargo and all older creations remain intact.

The [expedition replay](../20260915-064000-codex-01/TASK.md) verified Obsidian Kite
and Underpass with separate submerged cargo across 330 simulation seconds.
All 46 test objects survived. The flyer completed four actual flight/landing
circuits with 21.72 m excursion and 0.700 m gear travel. The crane lifted its
crate 5.40 m, carried it 1.013 m sideways and released it onto a tray; final
30-second drift was under 0.1 mm. These two unchanged Pi designs and the crate
are bundled; the first 42 catalog entries remain intact. The guarded fresh-world
and save/reopen integration passed. No live migration was needed.

**Amberback**, live ID 53, remains preserved but stalled. **Amberguard** 58
now passed both the populated 360 s replay and a clean forced-lift recovery
comparison: 83 cycles after a single induced failure, five reversals, minimum
up=0.994916. **Longwake** 56 completed two full routes. **Lattice** 60 carried its
separate crate through 20 hydraulic cycles, keeping it within 4 cm horizontally
of the tray center. All 51 test objects survived. A misplaced recovery clone on
the basin ledge is recorded separately; that run does not establish reliable
rough-terrain walking. The [expedition issue](../20260915-064000-codex-01/TASK.md)
has the measurements and original-source evidence.

The **49-object/1345-part catalog is now bundled**, retaining the first 45
entries unchanged. The guarded fresh-image check passed with zero removals and
all 49 objects restored on reopen. Its sampler now observes Postbird's brief
magnet-off delivery interval instead of skipping over it; assertions are
unchanged. Evidence is in `build/blockwalker-survey/` and the final build/check
logs. The live world's 52 objects and full conversation were preserved through
the normal verified import into the new image. The biped is not bundled.

[Population profiling](../20260915-060200-codex-01/TASK.md) reduced C render-tree
construction from 1.31 to 0.47 ms using median partitioning, with unchanged GPU
work and eight byte-identical frozen views/world state. No consistent FPS boost
was established. Guarded editor/native checks passed. Live app sources/binary
were updated in place with full world/history hashes unchanged. Pi resumed real
Astra/xhigh calls and successful tools; world time and population are advancing.
The [timer fix](../20260915-062600-codex-01/TASK.md) is now verified in fresh
loads: a typed kernel hint schedules cancellable short wakeups, with all
readiness/lifecycle decisions still in Wasm. Two paired 45-object runs measured
34.6–37.4 FPS before and 54.6–58.0 after at the unchanged 16 ms game timer.
Chrome and Firefox core checks and the game editor browser passed. No outer
imports or image-input identity changed; no image rebuild was required.
The live world has now migrated to the new runtime through the ordinary file
picker and a chunked archive. All five selected files matched byte-for-byte;
world and full history also matched `sha256sum` inside Dolly after compilation.
The new named session passed the actual session compatibility check. Pi resumed
Astra/xhigh requests at 23:02 UTC. At 23:07:27 UTC, world time reached
27465.3500 s with all 52 saved IDs/controllers still present, 1361 parts and no
new removals. The full 315,243,596-byte history prefix is preserved in the growing
316,072,399-byte file. `wakeup-continuation-proof.json` records the evidence.
Pi actually completed a 90 s trial through its new tool and is testing Sidelight X.
Old runtime artifacts remain in
`build/blockwalker-timer-before/`.

[Longer practice trials](../20260915-080300-codex-01/TASK.md) and
[controller-memory inspection](../20260915-080400-codex-01/TASK.md) are now bundled.
The focused C test passed inside Dolly, including bounded failed snapshots and
continued controller execution. A fresh-image 90 s Sidelight XI replay reproduced
Pi's physical result and captured 89 practice-memory snapshots. It stayed upright
but stalled in terminal recovery at 34.95 s, completing zero support cycles;
maximum forward excursion was only 0.194 m. No biped is bundled or claimed to walk.
The preserved workshop reached **Sidelight XII — damped support and landing audit**.

The tool-update migration preserved all 52 objects/1361 parts and the entire
318,417,097-byte native history. All five selected files matched byte-for-byte
after import; world/history SHA-256 also matched inside Dolly. The new session
`blockwalker-feedback` passes the actual compatibility check. The initial save
under the existing `blockwalker-biped` name hit a Playwright dialog-handler race;
file import had already completed. Saving under the new name succeeded without
reimporting or altering the preserved files. The old named session remains intact.
Pi resumed actual Astra/xhigh requests at 23:24:58 and 23:25:02 UTC with the new
diagnostics and numerical Sidelight XI findings. `feedback-continuation-proof.json`
records the first advancing-world checkpoint and matching saved IDs/sources.

### Owned services — recheck PIDs before stopping anything

| Service | PID | Address / script |
| --- | --- | --- |
| Preview | 104549 | `http://127.0.0.1:9099/blockwalker/`, `scripts/serve-gpu.mjs 9099 blockwalker` |
| Relay | 17316 | port 9010; allows origins 9099 and 19199 |
| Live browser runner | 17317 | CDP `http://127.0.0.1:9231`, `build/blockwalker-water-live.mjs` |
| Five-minute backup monitor | 316212 | `build/blockwalker-survey-monitor.mjs --watch` |

The session is **`blockwalker-survey`**, with persistent browser profile
`.cache/blockwalker-browser-20260915`. Run scripts under the `build` symlink with
`node --preserve-symlinks-main`. Logs use the matching script names under `build`.
Current screenshots/status: `build/blockwalker-walking/latest.png`, `status.json`.
Request metadata in `requests.jsonl` verifies the real Astra/xhigh calls without
recording credentials. The private relay config is referenced by the restore
script; never print or commit it.

### Preserve the world and complete conversation

The monitor mirrors selected files under
`build/blockwalker-walking/current-state/`: the world, working blueprint, Pi
config/events and full native session JSONL. It excludes models/auth. The native
conversation reached **324,538,688 bytes** before the catalog update, with
1,619 valid JSONL entries. Its complete SHA-256 is
`129d4f60c6f57683bf554edf131b82d58e1df747d1827f43f771091dae61bc85`.
All five selected files matched the archive after file-picker import, and the
world/history hashes matched inside Dolly. The earlier 318,417,097-byte prefix
was verified too. Evidence: `survey-{restore,restored,updated}-proof.json`.
Startup reads the full native history and can pause frames for minutes; do not
restart merely because loading is slow.

Latest recovery files are `survey-state.tar` (326,553,600 bytes),
`survey-state.tar.gz` (241,588,041 bytes) and five `survey-state-XX.part` files
of at most 48 MiB. They preserve 52 objects/1361 parts at world age 30460.0667 s,
with nine prior removals. The manifest is `survey-restore-proof.json`; older
archives remain available. `build/blockwalker-survey-restore.mjs` imports the
files and owned relay config into a fresh image, then saves `blockwalker-survey`.
Use a new session name if restoring another checkpoint; saving over a different
existing name prompts a browser confirmation. `blockwalker-survey-resume.mjs`
starts Pi again. The new binary, tools and catalog are in the packaged image.

The old monolithic monitor exceeded Playwright's 256 MiB WebSocket message limit;
the live browser and Wasm filesystem survived. **Do not restart monitor 187845.**
The current survey monitor returns file metadata first, then transfers
8 MiB binary chunks; a full backup succeeded. Stop it before manual exports to
avoid overlap. It still uses the normal saved-session interface. `progress.json` also records
full snapshot and history byte counts to monitor session capacity.

For app-only C/JS changes, update in place after pausing Pi and backing up:
`build/blockwalker-long-trial-update.mjs` uploads the prepared source archive,
compiles to a temporary binary inside the existing Dolly filesystem, checks it,
then replaces the app binary. Compilation took **3.297 s**, checks **5.535 s**.
No image reload or history/credential reimport was needed. Use new temporary
binary/archive names on repetition. Host/runtime changes still require migration.

Before an update or migration, stop only the verified monitor, use
`build/blockwalker-magnet-pause.mjs` to pause Pi/exit to Slop, then run the current
monitor once to capture final files. Preserve a credential-free USTAR archive,
gzip/split as needed, and restore through the real browser file picker. The
full-restore template is `build/blockwalker-basin-restore.mjs`; it uses CDP's
file-input setter because Playwright's remote helper rejects files over 50 MB.
It adapts the previously verified focus restore; the current survey archive
has been verified after import into the fresh image.
Use a fresh session name and restart its monitor after restoring. Verify IDs,
attachments, the full history prefix and actual Astra/xhigh continuation.

The 64 MiB file-transfer limits are separate from the removed HTTP request
limit. Reassemble with `cat /tmp/PARTS... | gzip -dc - | tar -xf - -C /workspace`;
this gzip requires the explicit stdin `-`. Remove imported temporary chunks
after success. Do not truncate history or add a host filesystem bypass. See
[streaming transfers](../20260915-030600-codex-01/TASK.md).

Older `*-state.tar` archives remain in the walking folder: checkpoint,
space-camera, water, navigation, magnet, magnet-carry, library, outposts, focus, cargo, basin and the
compaction probe. The water recovery used a saved 28 MB conversation; an interval
after that earlier checkpoint was lost with the old temporary browser profile
during the desktop freeze. Do not claim that interval was recovered. Later
migrations preserved their complete input histories.

### Verification and iteration

Read [the crash handoff](../../docs/crash-handoff.md). Never deep-assert image
Buffers: Node's assertion diff caused a reproducible host-memory explosion.
Use bounded boolean comparisons and actual camera coordinates. Run only one
test browser at a time, under a 4 GiB/no-swap process-tree scope:

```sh
systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0 \
  timeout --signal=TERM --kill-after=5s 180s \
  xvfb-run -a node test/blockwalker-browser.mjs
```

The focused suites are `blockwalker-browser.mjs`, `blockwalker-agent-browser.mjs`
and `blockwalker-focus-browser.mjs` under `test/`. Choose checks for the change;
do not rerun all suites after unchanged behavior has passed. Build changed C
inside Dolly using `prepare-blockwalker.mjs`, `update-module-pins.mjs`, route
generation and the blockwalker snapshot builder. Dependencies are cached; the
last app build took 17.4 seconds. No host C compilation is permitted.

No build or test browser remains running at this checkpoint. The live Pi world
continues independently. Source-only starter updates do not require migrating
an existing saved world.

## Verified features and evidence

| Feature | Evidence |
| --- | --- |
| World/workshop camera, dark space UI, moon/stars and real thrust flames | b19b328; `build/blockwalker-space-camera-browser.log`, `blockwalker-space-agent-browser.log`, actual `blockwalker-feedback.png` |
| 512 m terrain, docks/islands, eight-point buoyancy/drag, hull/ballast and finishes, anchored structures | 6578160; `build/blockwalker-water-editor-guarded.log`, `blockwalker-water-agent-guarded.log`, native physics checks |
| Navigation shortcuts and full population paging | 6511074; twelve physical beacons in `build/blockwalker-world-navigation-browser.log` |
| Finite-force magnets, separate cargo and saved attachments | [Magnet task](../20260915-012000-codex-01/TASK.md), 03a1f05; actual Pi crane carry/release and restoration |
| Saved blueprint/controller library and manual Play program | [Library task](../20260915-020000-codex-01/TASK.md), d30e308 |
| Concise compaction, controller inspection and removal causes | [Compaction](../20260915-021300-codex-01/TASK.md), [diagnostics](../20260915-021000-codex-01/TASK.md), b7c84cb |
| Physical island outposts, overhead passage, GPU headers and continued latest Pi request | [Outposts task](../20260915-024600-codex-01/TASK.md), 7c05e21 |
| Fresh populations, deduplicated library with independent crate placements | Tasks [023600](../20260915-023600-codex-01/TASK.md), [031100](../20260915-031100-codex-01/TASK.md), [035000](../20260915-035000-codex-01/TASK.md) |
| Follow camera and expanded focus/Pi views | [Focus task](../20260915-035700-codex-01/TASK.md), f3f8546; three browser suites passed |
| Polar gantry, approach tender and two-stage pier in fresh worlds | [Service machinery](../20260915-041300-codex-01/TASK.md); 30 objects/679 parts, four distinct magnetic cargo systems |

The native water test measured 14.093 m travel in six seconds, a 1.274 rad turn,
minimum up=0.992 and 0.00032 m separation. Anchored motion kept the root fixed,
with 0.00835 m maximum separation. Evidence: the water checkpoint's native
physics checks and actual GPU water/world images under `build/blockwalker-proof`.

A separate early 36-creature/546-part workload ran at 38.10 FPS with simulation
matching wall time and no removals over 12 seconds; it was not added to the live
world. Its replay and results remain under `build/blockwalker-population/`.
The latest 30-object/679-part full-screen showcase measured 55–58 FPS, matching
simulation to wall time with zero removals. See `build/blockwalker-service-gallery.log`
and `build/blockwalker-service/`. These short runs had the separate live Pi world
running too; they do not isolate GPU cost or establish a performance improvement.

Earlier checkpoint narratives and old process IDs remain in repository history
at `96fb475:tasks/20260914-blockwalker-space-world/TASK.md`. Use the current service
and recovery information above, rather than those historical PIDs.

## Inspiration examined on 2026-09-14

- [Box3D Physics Demo](https://github.com/SifuInTheShell/Box3D_Demo): jointed crane
  cables, suspension bridges, wheel-joint cars, eight-point buoyancy and drag,
  interactive water ripples. These are application systems above Box3D.
- [Box3D for Unity](https://github.com/Suvitruf/box3d-unity): analytic buoyancy
  volumes and separately GPU particle water; useful distinction for choosing
  affordable boat physics before attempting fluid simulation.
- [Box3D Godot samples](https://github.com/Stink-O/box3d-godot): playable mechanism
  and vehicle samples with a movable camera. Native benchmark claims do not
  establish performance in Dolly's serial wasm64 simulation.

Start with sampled buoyancy and matching rendered waves, then measure. Add
force at submerged points so hull layout affects stability and steering.
