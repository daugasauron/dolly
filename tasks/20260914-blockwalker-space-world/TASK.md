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

## Current checkpoint — 2026-09-15 07:30 JST

Work only in `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-20260914`. Other worktrees/previews belong to other agents.
Do not push, deploy or merge this branch without a new request. Continue the
full goal until 22:00 JST; the checkpoints below do not end the timed work.

Fresh images contain **45 objects/1211 parts**. The controller-update backup at
22:15 UTC has **52 survivors/1361 parts** and nine removals: six older causes
unknown, and three diagnosed elapsed controller deadlines while upright
(Marrowstep 48, Northline 36, Vesper 40). Marrowstep has a replacement, ID 59.
The [controller fix](../20260915-065100-codex-01/TASK.md) passed finite-controller
pause, runaway, native and browser checks. The live C binary was compiled and
updated inside Dolly with all five selected workspace files byte-identical.
All 52 objects restore with zero pose error, unchanged memory and step counts,
and three magnetic attachments. Pi resumed actual Astra/xhigh requests and successful tools. At 22:29:48 UTC,
world time reached 25733.5167 s with all 52 survivors and no new removals;
requests reached 381/380 completed.

The latest user priority is [a two-legged walker](../20260915-070100-codex-01/TASK.md).
The 33-part Sidelight III has two five-joint legs and articulated feet; an
independent replay confirmed sliding, not lift. Pi has rebuilt the prototype as
taller Sidelight IV with more joint clearance, and is retesting standing before
weight transfer. No biped is bundled or claimed to walk yet. Preserve all existing
creations while developing single support, alternating steps and travel.
Read `build/blockwalker-walking/progress.json` and `current-state/blockwalker-world.json`
for newer state; an old snapshot or startup timeout does not prove process exit.

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

**Amberback**, live ID 53, passed the fresh 330-second seed but stalled in the
long-lived world at age 253 s. Keep it unbundled while Pi's **Amberstride** 57 and
**Amberguard** 58 recovery revisions are independently verified. The original
remains alive. **Longwake** 56 is a new 43-part channel survey boat, also unverified
for the fresh catalog. Preserve existing creations and the complete conversation.

[Population profiling](../20260915-060200-codex-01/TASK.md) reduced C render-tree
construction from 1.31 to 0.47 ms using median partitioning, with unchanged GPU
work and eight byte-identical frozen views/world state. No consistent FPS boost
was established. Guarded editor/native checks passed. Live app sources/binary
were updated in place with full world/history hashes unchanged. Pi resumed real
Astra/xhigh calls and successful tools; world time and population are advancing.
The [timer task](../20260915-062600-codex-01/TASK.md) tracks remaining frame-pacing
measurements. Its real browser probe reproduced 1–12 ms waits waking at 16 ms,
and 16 ms waits at 32 ms. No host scheduling or GPU ABI change was made.

### Owned services — recheck PIDs before stopping anything

| Service | PID | Address / script |
| --- | --- | --- |
| Preview | 104549 | `http://127.0.0.1:9099/blockwalker/`, `scripts/serve-gpu.mjs 9099 blockwalker` |
| Relay | 17316 | port 9010; allows origins 9099 and 19199 |
| Live browser runner | 17317 | CDP `http://127.0.0.1:9231`, `build/blockwalker-water-live.mjs` |
| Five-minute backup monitor | 248825 | `build/blockwalker-performance-monitor.mjs --watch` |

The session is **`blockwalker-basin`**, with persistent browser profile
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
conversation reached **309,962,807 bytes** before the controller update, with
1,481 valid JSONL entries. Its complete SHA-256, world, blueprint, config and
events all matched across compilation. Evidence: `controller-updated-proof.json`
and `controller-restore-proof.json` in the walking folder. The first continued mirror is 312,153,420 bytes, retaining that full 310 MB
pre-update prefix. See `controller-continuation-proof.json`. The complete earlier
274,387,780-byte history prefix is also verified. Startup reads the entire native
history and can pause game frames for several minutes; do not restart it merely
because that loading period is slow.

Latest recovery files are `controller-state.tar` (312,115,200 bytes),
`controller-state.tar.gz` (231,109,184 bytes) and five `controller-state-XX.part`
files of at most 48 MiB. They preserve 52 creatures/1361 parts at world age
25482.8167 s. The manifest/hash are in `controller-restore-proof.json` under the
walking folder. All older recovery archives remain available.

The old monolithic monitor exceeded Playwright's 256 MiB WebSocket message limit;
the live browser and Wasm filesystem survived. **Do not restart monitor 187845.**
The current performance monitor returns file metadata first, then transfers
8 MiB binary chunks; a full backup succeeded. Stop it before manual exports to
avoid overlap. It still uses the normal saved-session interface.

For app-only C/JS changes, update in place after pausing Pi and backing up:
`build/blockwalker-controller-update.mjs` uploads the prepared source archive,
compiles to a temporary binary inside the existing Dolly filesystem, checks it,
then replaces the app binary. Compilation took **1.539 s**, checks **5.552 s**.
No image reload or history/credential reimport was needed. Use new temporary
binary/archive names on repetition. Host/runtime changes still require migration.

Before an update or migration, stop only the verified monitor, use
`build/blockwalker-magnet-pause.mjs` to pause Pi/exit to Slop, then run the current
monitor once to capture final files. Preserve a credential-free USTAR archive,
gzip/split as needed, and restore through the real browser file picker. The
full-restore template is `build/blockwalker-basin-restore.mjs`; it uses CDP's
file-input setter because Playwright's remote helper rejects files over 50 MB.
It adapts the previously verified focus restore; the latest checkpoints used
in-place updates, so the new archive has not been reimported into a fresh browser.
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
