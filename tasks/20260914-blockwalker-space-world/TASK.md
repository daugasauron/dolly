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

## Current checkpoint — 2026-09-15 11:35 JST

Work only in `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-20260914`. Other worktrees/previews belong to other agents.
No push, deploy or merge authorization. Continue until 22:00 JST; this checkpoint
does not end the timed work.

Fresh images contain **50 objects/1374 parts**. The live world has **53
objects/1390 parts**, including replacement Sidelight #63, with ten removals.
The [original biped](../20260915-070100-codex-01/TASK.md) passed 240 s in the world
and 300 s practice with 12/16 alternating physical landings. It remains slow.
Live #62 later tipped over at age 1375.55 s after about 34.89 m forward travel;
its removal record is preserved. Pi released exact original source/blueprint as
new #63 at (60,-50). All 52 older surviving objects remain intact.

The [late-fall replay](../20260915-110000-codex-01/TASK.md) reproduced the removal
exactly, including time, position and up. All 53 initial poses/velocities,
controller memory and random states matched. It ran 426.0667 simulation seconds
in 693.129 instrumented wall seconds. Transfer timed out at age 1327.967 s,
recovery at 1339.983 s; the fall followed in phase 9. Nearby-body/transition
analysis found walker #22's foot boxes overlapping its feet before the failed
transfer. This does not establish the cause without a controlled comparison.
The guarded `build/blockwalker-no-pistonboot-browser.mjs` replay is running
(runner PID 389727), omitting only #22 from the copied initial world. No live
objects were removed. Exact replay artifacts are in `build/blockwalker-late-fall/`;
the comparison writes to `build/blockwalker-no-pistonboot/`.

The [300 s practice extension](../20260915-103400-codex-01/TASK.md) passed:
18000 ticks, rejection of 18001, three timed GPU images and stopped practice
afterward. Original XXVIII made 16 alternating placements and travelled 5.48660 m,
minimum up=0.973662. Actual Astra/xhigh Pi also completed 300 s with three GPU
images and readable memory. The app rebuilt in 20.6 s, snapshot 231885797 bytes
(SHA prefix f0e30fcc811a7b33). Fresh-browser checks confirm its executable matches
the verified live executable byte-for-byte and accepts the new bound. Kernel
hash remains d39a823c5863d0b1c8508f0d78e61cfe2408144a9ddaa6ecd57919e320718d72.

The new named session is **blockwalker-endurance**. Complete import passed all
five file hashes, in-Dolly world/history hashes and real session compatibility.
Actual Astra/xhigh continuation and advancing-world preservation passed at
02:34 UTC: all 53 IDs/sources/blueprints, 1390 parts, ten unchanged removals,
and the entire 341,646,263-byte native history prefix remain intact.
The archive preserves the latest **XXXIV alloy-pelvis mass-only comparison**,
all 53 current objects and the complete native Pi history. See recovery below.
The in-place app update before packaging took 3.324 s to compile and 5.587 s for
native checks, with all workspace files unchanged and updated app files proven
present in the named snapshot. No C physics tuning was changed.

The [faster-biped comparison](../20260915-102900-codex-01/TASK.md) retains failed
XXXI: five good early placements, then posture removal at 172 s. XXXIII passed
180 s practice and 300 s populated/save-reopen checks, but travelled only 4.74551 m
versus the original alongside at 5.70929 m. Both survived, with all 51 test
objects/1403 parts restored exactly. XXXIII's inner foot-box spacing still narrows
to about 0.96 m; it spends 109/180 s transferring weight. Actual Pi's 300 s
reach-cap-only comparison found no demonstrated benefit from the outward spacing
correction. Keep these variants out of the default catalog; continue the new
mass-distribution experiment separately. Bounded status:
`python3 build/blockwalker-biped-status.py`.

Keep the current 60 Hz joint constraints. A temporary 120 Hz comparison reduced
angular flex but regressed boat navigation; see the
[stiffness issue](../20260915-093700-codex-01/TASK.md).
Earlier verified features are linked below; detailed checkpoint narratives are
in repository history at `ea7561a:tasks/20260914-blockwalker-space-world/TASK.md`.

- [Landers](../20260915-045200-codex-01/TASK.md): feedback takeoff, routes, return,
  hydraulic gear and seeded variation.
- [Basalt basin](../20260915-051000-codex-01/TASK.md): 21 physical terrain boxes,
  ledges/entrances, matte shaders and camera navigation.
- [Survey/salvage](../20260915-055500-codex-01/TASK.md): Sundial, Marrowstep,
  Kelpglass, Brinehook and Shoalhook; real crate lift/carry/release.
- [Expedition/recovery](../20260915-064000-codex-01/TASK.md): Obsidian Kite,
  Underpass's submerged cargo, Amberguard's forced-lift recovery and 83 cycles,
  Longwake's routes and Lattice's 20 loaded lift cycles.
- [Controller budget](../20260915-065100-codex-01/TASK.md): bounded computation
  independent of browser pauses; finite pause and runaway checks passed.
- [Render-tree profiling](../20260915-060200-codex-01/TASK.md): 1.31→0.47 ms,
  byte-identical frozen GPU views; no consistent FPS boost established.
- [Timer scheduling](../20260915-062600-codex-01/TASK.md): paired 45-object
  runs improved 34.6–37.4→54.6–58.0 FPS with unchanged outer imports; real Chrome,
  Firefox and editor checks passed.
- [Bounded memory inspection](../20260915-080400-codex-01/TASK.md): safe diagnostics
  and continued controller execution, with real physics replay and GPU images.

The ten removals comprise six unknown old causes, three elapsed old controller
budgets while upright (Marrowstep 48, Northline 36, Vesper 40), and #62's later
posture failure. Replacements are Marrowstep 59 and Sidelight 63; all saved designs
remain. Amberback 53 remains stalled. Existing Kelpglass 49 conflicts with the
western island corner; its fresh placement passed a full circuit farther south.
Preserve these live objects.

### Owned services — recheck PIDs before stopping anything

| Service | PID | Address / script |
| --- | --- | --- |
| Preview | 104549 | `http://127.0.0.1:9099/blockwalker/`, `scripts/serve-gpu.mjs 9099 blockwalker` |
| Relay | 17316 | port 9010; allows origins 9099 and 19199 |
| Live browser runner | 17317 | CDP `http://127.0.0.1:9231`, `build/blockwalker-water-live.mjs` |
| Five-minute backup monitor | 387963 | `build/blockwalker-endurance-monitor.mjs --watch` |

The session is **`blockwalker-endurance`**, with persistent browser profile
`.cache/blockwalker-browser-20260915`. Run scripts under the `build` symlink with
`node --preserve-symlinks-main`. Logs use the matching script names under `build`.
Current screenshots/status: `build/blockwalker-walking/latest.png`, `status.json`.
Request metadata in `requests.jsonl` verifies the real Astra/xhigh calls without
recording credentials. The private relay config is referenced by the restore
script; never print or commit it.

### Preserve the world and complete conversation

The monitor mirrors selected files under
`build/blockwalker-walking/current-state/`: world, working blueprint, Pi config,
events and the full native session JSONL. Models/auth are excluded. The
02:18 UTC recovery checkpoint contains **341,646,263 bytes / 1,744 valid JSONL
entries**, SHA-256
`6c4657c8a5e2d1668d678a269a7070b129c209f2ca28e8aeac141e99bf663a7a`.
The entire prior 338,097,474-byte history prefix was verified unchanged.
All five selected files matched after ordinary file-picker import, including
in-Dolly world/history hashes and the real session compatibility check.
`endurance-image-{restored,updated,continuation}-proof.json` records this.
The 02:33 UTC mirror reached world age 37075.400000 with all 53 IDs/sources,
1390 parts and no new removals. Its 342,396,532-byte native history retains the
entire verified recovery prefix; actual Astra/xhigh requests resumed at
02:27:42 UTC.
Startup loads the full native history and may pause frames for minutes; do not
restart merely because loading or Astra inference is slow.

Recovery archive: `endurance-state.tar` (343,685,120 bytes), gzip (254,064,113
bytes), six `endurance-state-XX.part` files of at most 48 MiB; all under
`build/blockwalker-walking/`, mode 600. `endurance-restore-proof.json` records
53 objects/1390 parts at world age 36775.266667 s, ten removals, hashes and file
sizes. `sidelight-replacement-proof.json` verifies unchanged original source and
blueprint for replacement #63 while preserving #62's late-fall record.

The scripts `build/blockwalker-endurance-image-{restore,verify,resume}.mjs` perform
normal file import, in-Dolly hash/compatibility checks and continuation. Always
use a new unique session name for another migration; older sessions/archives
remain intact. Do not overwrite a different named session through a raced
confirmation dialog. The continuation verifier checks every prior ID/source,
advancing world time, unchanged complete history prefix and real Astra/xhigh
requests. `build/blockwalker-endurance-image-continuation.py` performs that check.

The old monolithic monitor exceeded Playwright's 256 MiB WebSocket message limit;
the live browser and Wasm filesystem survived. **Do not restart monitor 187845.**
The current endurance monitor returns file metadata first, then transfers
8 MiB binary chunks; a full backup succeeded. Stop it before manual exports to
avoid overlap. It still uses the normal saved-session interface. `progress.json` also records
full snapshot and history byte counts to monitor session capacity.

For app-only C/JS changes, update in place after pausing Pi and backing up:
`build/blockwalker-endurance-update.mjs` uploads the prepared source archive,
compiles to a temporary binary inside the existing Dolly filesystem, checks it,
then replaces the app binary. Compilation took **3.324 s**, checks **5.587 s**.
No image reload or history/credential reimport was needed. Use new temporary
binary/archive names on repetition. Host/runtime changes still require migration.

Before an update or migration, stop only the verified monitor, use
`build/blockwalker-wakeup-pause.mjs` to pause Pi/exit to Slop, then run the current
monitor once to capture final files. Preserve a credential-free USTAR archive,
gzip/split as needed, and restore through the real browser file picker. The
full-restore template is `build/blockwalker-endurance-image-restore.mjs`; it uses CDP's
file-input setter because Playwright's remote helper rejects files over 50 MB.
The current endurance archive has been verified after import into the fresh image.
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
last app build took 20.6 seconds. No host C compilation is permitted.

The guarded no-pistonboot comparison browser is running; the live Pi world
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
An earlier 30-object/679-part full-screen showcase measured 55–58 FPS, matching
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
