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

## First checkpoint, 2026-09-14

World camera travel and separate world/workshop viewpoints are implemented,
including click-to-visit and explicit Pi camera targets. Dark UI, star field,
moon and command-driven thruster exhaust are in the GPU scene. Water, larger
terrain, anchored structures and block designs remain to implement.

Chrome/NVIDIA checks passed: `build/blockwalker-space-camera-browser.log`
(camera travel, prompt isolation, 160-part editing, underside placement,
bindings and persistence); `build/blockwalker-space-agent-browser.log`
(native camera API, timed GPU captures, PID flight and resumed world).
The 60 Hz flight test finished at y=4.5497 m, vy=-0.0133 m/s, up=1.0.
Actual exhaust image: `build/blockwalker-proof/blockwalker-feedback.png`.

Preview: http://127.0.0.1:9099/blockwalker/; the dedicated Pi browser uses
session `blockwalker-space`. Migrated all 11 survivors and the full 28 MB Pi
conversation from `build/blockwalker-walking/space-camera-state.tar`, retaining
the backup. Pi's own five-part flyer had remained upright at y=3.31 m after
485 simulation seconds before the migration. Continue the larger-world work.

## Water checkpoint, 2026-09-15 00:52 JST

Added a 512 m island world with physical docks, matching GPU waves and sampled
buoyancy/drag. Hull and ballast materials affect mass and flotation; four
finishes change appearance. Anchored roots support moving bridges and cranes.
Version 4 blueprints preserve these settings while versions 1–3 still load.
Ground/water trials and physics water sensors are available directly to Pi.

The image compiled entirely inside Dolly and passed the native checks. The
11-part catamaran floated at root y=-0.883 m, up=0.996, hull submersion=0.360;
it drove 14.093 m in six seconds and turned 1.274 rad with minimum up=0.992.
Maximum separation was 0.00032 m. The anchored mechanism's root moved 0 m,
with hinge motion in both directions and 0.00835 m maximum separation.
Evidence: `build/blockwalker-proof/physics-check.log`.

Both focused browser suites passed on Chrome/NVIDIA under separate 4 GiB,
no-swap process-tree limits and 180-second timeouts. Logs:
`build/blockwalker-water-editor-guarded.log` (38 seconds) and
`build/blockwalker-water-agent-guarded.log` (40 seconds). Integration retained
five land/air/sea/anchored survivors across restart. Camera checks use actual
C coordinates, independent of animated water; the host-memory assertion issue
is recorded and closed in `tasks/20260915-004300-codex-01/TASK.md`.
Visual evidence: `build/blockwalker-proof/blockwalker-water.png` and
`build/blockwalker-proof/blockwalker-world.png`.

After the host restart, restored all 12 saved creatures at world age 5333 s
and the full 28 MB saved Pi conversation checkpoint. Later world/controllers
were preserved even though the later full conversation was lost with the old
temporary browser profile. Recovery archive:
`build/blockwalker-walking/water-state.tar`; session: `blockwalker-water`.
The new browser profile lives under `.cache/blockwalker-browser-20260915`.
Pi's request at 15:51:29 UTC used `gpt-6-astra`, effort `xhigh`, verified in
`build/blockwalker-walking/requests.jsonl`. Continue populating the sea and
harbor, improve navigation and larger mechanisms, and measure the fuller world.

Navigation follow-up: harbor/island/overview shortcuts, paged and scrollable
population list, and camera fitting for larger creations are implemented.
`build/blockwalker-world-navigation-browser.log` passed under the same guarded
browser command. Twelve physical anchored test creations prove paging to the
last creature, fitting its 12-part span, and scrolling back to earlier entries.
Actual camera coordinates verify all five destination shortcuts. The live
browser was subsequently migrated to `blockwalker-islands`, preserving all
12 survivors, the 19-part boat under development and the full conversation.

## Population measurement, 2026-09-15 01:04 JST

In a separate browser, copied the saved world and added sixteen 11-part boats
and eight 27-part cranes with motorized slewing and telescoping hoists. The
36-creature, 546-part scene advanced 12.017 simulation seconds in 12.022 wall
seconds, with 38.10 FPS and no removals during that measured interval. Mean
embedded frame-call time rose from 7.13 ms for the original 12 creatures/154
parts to 9.87 ms for the expanded scene. The separate live Pi browser was also
running; these are short, concurrent-scene measurements, not an isolated GPU
benchmark or long-term stability proof.

Saved poses showed at most 0.00318 m attachment separation for the cranes and
0.00012 m for the boats (excluding intended piston travel). The eight cranes
were still anchored and the boats afloat. Evidence and replayable world:
`build/blockwalker-population-browser.log`,
`build/blockwalker-population/blockwalker-population.json` and
`build/blockwalker-population/blockwalker-world.json`; image:
`build/blockwalker-population/population-expanded-1.png`. These benchmark
creatures were not added to the ongoing Pi world.

## Magnet and camera checkpoint, 2026-09-15 01:44 JST

Powered magnets and cargo landed in 03a1f05; see task
`20260915-012000-codex-01` for finite-force physics and browser evidence. The
live Astra/xhigh session was migrated with 14 current survivors and its full
46 MB conversation. It is experimenting with an 18-part cargo crane.

That crane exposed practice-camera framing drift: every simulation frame pulled
the camera toward the root, cropping tall mechanisms and overriding explicit
agent camera targets. Follow root displacement while preserving the chosen
camera offset instead. The focused browser integration passed, including a
moving thruster body's measured camera/root offset, loaded magnet restoration,
boat buoyancy, anchored bridge and PID flight. The magnet image now shows the
whole hoist and suspended crate. Evidence:
`build/blockwalker-camera-follow-integration.log` and
`build/blockwalker-proof/blockwalker-magnet.png`. The camera fix is built,
verified and running in the live `blockwalker-cranes` session as of 01:49 JST.
Restored all 15 current survivors at world age 8360.45 s, including Dockhand and
its latched cargo, plus the complete 53 MB Pi conversation. Both original
tripods were eventually removed by the survival/controller checks; the old log
does not identify which check failed. Their designs remain in earlier backups.
The first saved frame after restore retained cargo attachment ID 20 at
6.2375 N load. Pi resumed through Astra/xhigh and is inspecting the crane before
continuing the larger-world experiments.

Current recovery archive: `build/blockwalker-walking/magnet-carry-state.tar`;
latest full filesystem/conversation copies: `build/blockwalker-walking/current-state`.
Own preview PID 61655 serves 9099; relay PID 17316 serves 9010; browser runner
PID 17317 exposes CDP 9231; monitor PID 62613 saves `blockwalker-cranes` every
five minutes. Stop only that monitor when migrating. The latest restoration
script is `build/blockwalker-cranes-restore.mjs`; it uses CDP's file input setter
because Playwright's remote upload helper rejects the now-over-50 MB archive.
No history was truncated. Continue the timed goal until 22:00 JST.

## Design library checkpoint, 2026-09-15 02:11 JST

Commit d30e308 adds a persistent design/controller library, 13 learned examples,
browser selection and continuous manual Play program without Pi. Both focused
browser suites passed; the selected catamaran moved 3.1306 m in 244 physics steps
at up=0.99499. See closed task `20260915-020000-codex-01` for evidence.
Commit 698d143 tracks the missing removal-cause diagnostics in task
`20260915-021000-codex-01`; the older logs cannot distinguish posture failure
from a failed controller, so do not claim those removals were proven falls.

The live browser remains on the previous crane/camera image. It now has 17
survivors, including Pi's newer 21-part Touchdown Pistonboot and 22-part Skybarge.
A natural threshold compaction began at 17:01:57 UTC; its actual
`compaction_start` event is saved in the events file and the world continues
advancing. At 17:09:12 the monitor showed 27 requests / 26 completed, world
age 9542.52 s and all 17 survivors. Do not abort or restart solely because the
summary is taking several minutes; let it finish before migrating the library.
The model, relay and monitor are confirmed live. The current PIDs/paths remain
those listed above. No browser test remains running.

Next: verify the compaction end event (task `20260915-010700-codex-01`), add
removal diagnostics, then migrate the saved world/full conversation to the new
image using the existing CDP file-input restoration script. Preserve all new
creatures and cargo, and continue larger-world work until 22:00 JST.

At 17:11:57 the summary attempt ended with Browser HTTP deadline exceeded,
then the live Pi sent a normal request. The actual start/error-end notification
path is now verified and task 010700 is closed; investigate the distinct
summary-runtime failure in new task `20260915-021300-codex-01`. The full state
was freshly saved to current-state (see blockwalker-compaction-finish.log).
The library image remains built/verified and not yet migrated into the live
browser. Keep both library migration and failure diagnostics in the next work.

## Live recovery checkpoint, 2026-09-15 02:37 JST

Commit b7c84cb adds concise compaction, current-controller inspection and saved
removal causes. Both concrete issues are verified and closed: a copied full
session summarized through actual Astra/xhigh in 98 seconds, then called the
real observation tool; the browser physics suite distinguished controller
timeout from a toppling body and retained both records across restart.

Migrated the live browser to `blockwalker-library`, preserving 17 creatures at
world age 10954.30 s and the complete conversation. Recovery archive:
`build/blockwalker-walking/library-state.tar` (66,713,600 bytes, no credentials).
Dockhand restored its powered attachment to cargo ID 20 with 4.2948 N load.
The live automatic threshold summary then completed in 100,439 ms, producing
7,339 characters. Pi used design_library, inspect_program and watch_world,
ran another real trial and released its eighteenth surviving creature. All
observed requests retain Astra/xhigh. Full history is preserved; existing six
removals predate diagnostics and still have unknown causes.

Current own preview PID 87492 on 9099; relay 17316 on 9010; browser runner 17317
on CDP 9231; monitor 87941 saves `blockwalker-library` every five minutes.
The restoration and monitor scripts are now `build/blockwalker-library-restore.mjs`
and `build/blockwalker-library-monitor.mjs`. Evidence:
`build/blockwalker-library-live-proof.log`, latest current-state events and
`build/blockwalker-walking/requests.jsonl`. No test browser remains from the
previous probes. Fresh-image population is the next task, 023600; its focused
integration is running separately under the memory guard.

Fresh population verification finished at 02:41 JST. Both focused browser
suites passed; task 023600 is closed with measured crane carry/release, boat and
flight evidence. New browser sessions receive 15 moving starter objects from
the bundled design library; existing saves are unchanged. The live Pi browser
continues on the library/diagnostics image, with 18 survivors as of 02:39 JST;
no migration is needed for a change that only initializes absent world files.
The preview serves the newly built starter-world image to fresh page loads.
No browser tests remain running. Continue the timed goal until 22:00 JST.

## Island outposts checkpoint, 2026-09-15 03:08 JST

Task 024600 is verified: physical landing arch/pad, reactor and antenna/solar
station; matte and emissive materials; overhead passage; exported GPU headers
for rebuilding the included C source. Same-world old/new browser comparisons
kept simulation at real time with zero removals. See that task for measured
frame rates and actual GPU images. No test browser remains running.

The live session is now `blockwalker-outposts`, preserving 23 creatures and the
full conversation. New Pi designs include the 20-part Loadrunner magnetic
carrier and its separate crate, 39-part Threewake trimaran, 46-part Landfreighter,
and two faster quadrupeds. Its current unfinished experiment is Mooncalf with
hinged knees. Continue toward flying cargo machines and moving island structures.

Own preview PID 104549 on 9099; relay 17316 on 9010; browser runner 17317 / CDP
9231; monitor 107009 saves every five minutes. Current restore/monitor scripts:
`build/blockwalker-outposts-restore.mjs`, `build/blockwalker-outposts-monitor.mjs`.
Recovery: `build/blockwalker-walking/outposts-state.tar` and `.tar.gz`. The raw
archive exceeded the 64 MiB upload limit; gzip reduced it to 63,057,451 bytes and
ordinary `gzip -dc | tar -xf -` restored it inside Dolly. Original conversation
bytes were verified by SHA-256 prefix comparison after the restore. Task 030600
tracks streaming larger imports/exports; do not confuse it with the HTTP limit.

Next distribute the newer successful designs: fresh worlds still contain the
previous 15 starters. Preserve one library entry per design while allowing
multiple initial placements of the same crate. Keep the live world/history and
continue until 2026-09-15 22:00 JST.

## Larger starting population, 2026-09-15 03:25 JST

Task 031100 is closed: fresh sessions now have 21 objects/403 parts and 20
distinct library designs, including the larger trimaran, six-legged machine,
magnetic carrier and faster quadrupeds. Repeated initial crate placements no
longer get removed by design deduplication. Both focused browser suites and a
six-view GPU showcase passed; all controllers ran without network/model access.
The source data is one compact JSON record per initial placement for review.

The live Pi session remains `blockwalker-outposts`; its PIDs and backup paths
above remain current. No migration is needed for this initial-population change.
Pi has since created Postbird, a flying magnetic courier with its own crate,
and Westwatch, a 44-part two-axis scanning structure on the western island.
Its tool records report an actual pickup/carry/release/reattachment cycle for
Postbird and an approximately 85-degree sweep for Westwatch; inspect the current
full state and measured tool results before promoting these to the starter data.
It is working on a boat route near the island docks. Preserve these newer live
creations and all prior designs. No browser tests remain running.

## Working island population, 2026-09-15 03:43 JST

Task 035000 is verified and closed: fresh worlds now contain 26 objects/546
parts, including Postbird and its third distinct cargo box, Westwatch, Twinspire
and Mooncalf. The browser measured actual airborne cargo delivery/reacquisition,
beacon sweep, walking and boat patrol. Five GPU views passed at 34–43 FPS with
real-time simulation and no new removals. Source C still compiles inside Dolly.

The live Pi browser remains `blockwalker-outposts`, with its existing preview,
relay, runner and monitor PIDs unchanged. No migration was needed. Its full
native conversation backup reached 120,155,762 bytes at 18:38 UTC; preserve it
with split archives if another migration exceeds the upload limit even after
gzip. Latest request metadata still confirms Astra/xhigh. Pi has since built
Northline, a rolling gantry at the North station, with a fourth crate; inspect
its actual saved-world results before distributing it. The screen showed 30
survivors; the latest complete monitor backup still had 28 at 18:38 UTC.

No build or test browser remains running. Continue the timed goal until
2026-09-15 22:00 JST, preserving the successful world and complete conversation.

## Focus view and follow camera, 2026-09-15 04:06 JST

Commit f3f8546 adds Shift+Tab focus view, independent Tab Pi panel, expanded
mouse picking/captures and physical follow-camera tracking from the population
list. WASD releases following; removed targets leave the camera safely in place.
The new focused browser test and both existing editor/physics suites passed
under separate 4 GiB/no-swap scopes. See closed task 035700 for evidence.

Migrated the live session to `blockwalker-focus`, preserving 32 creations at
world age 15475.3333 s and the complete 141,563,139-byte native conversation.
Recovery archive `build/blockwalker-walking/focus-state.tar` is 143,513,600 bytes;
its gzip is 104,211,289 bytes. Three chunks of at most 48 MiB restored through
the ordinary file picker and `cat ... | gzip -dc - | tar -xf - -C /workspace`.
The initial attempt omitted gzip's required stdin `-` and was corrected on the
same page with the already-uploaded chunks; no backup or history was lost.
All original IDs and exact history-prefix SHA-256 matched after restore. Loaded
attachments included Loadrunner/cargo 25, Postbird/cargo 31 and Northline/cargo 35.

Own preview remains PID 104549 on 9099, relay 17316 on 9010 and browser runner
17317 on CDP 9231. New monitor PID 137939 saves `blockwalker-focus` every five
minutes. Scripts: `build/blockwalker-focus-restore.mjs` (corrected complete flow),
`build/blockwalker-focus-resume-restore.mjs` (used for this recovery), and
`build/blockwalker-focus-monitor.mjs`. Evidence is in the focus restore logs,
`build/blockwalker-walking/focus-restored-proof.json` and current-state backup.

Newest live designs are Northline (27 parts), Quayfin (42) and Tidelock, a
63-part two-stage service pier at x166.5,z0. These are not yet bundled in the
26-object fresh world. Inspect actual docking/gantry results before promotion.
Pi resumed into normal context compaction; request 1 is currently in flight,
not a failed process. The shared world continues advancing. Its latest steering
is to finish pier/tender docking, then create a larger feedback survey lander
with bounded randomized patrol and actual takeoff/landing. Preserve all older
designs and cargo. No build or test browser remains running.

At 19:06 UTC the summary had completed and the restored Pi was making real
observe, inspect_program, camera and watch_world calls. Browser counters showed
6 requests/5 completed; monitor request metadata confirms Astra/xhigh. Pi
recognized Tidelock as existing world ID 38 and continued checking Quayfin beside
it instead of releasing a duplicate. The wider live world and real Pi traces
are visible in `build/blockwalker-walking/focus-live-world.png`.
