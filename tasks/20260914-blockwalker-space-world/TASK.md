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

## Current checkpoint — 2026-09-15 04:22 JST

Work only in `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-20260914`. Other worktrees/previews belong to other agents.
Do not push, deploy or merge this branch without a new request. Continue the
full goal until 22:00 JST; the checkpoints below do not end the timed work.

Fresh images contain **30 objects/679 parts**. The latest completed live backup,
19:19:27 UTC, has **32 survivors**, six older removals and no removals since cause
diagnostics were added. Those older causes remain unknown. Read
`build/blockwalker-walking/progress.json` and `current-state/blockwalker-world.json`
for newer state; do not infer a stopped process from an old snapshot or timeout.

The live Astra/xhigh Pi is testing **Cairnwing**, a larger four-foot survey lander.
Its practice trial landed after 20 seconds with every foot touching, jets off and
5 mm displacement from home. Verify its actual island takeoff/patrol/return before
bundling it. Northline, Quayfin and Tidelock are now in the fresh population.
Quayfin approaches beside Tidelock; boarding and cargo transfer remain unproven.
The 19:24:27 UTC backup has 33 survivors, including Cairnwing ID 39 (62 parts)
at x184,z40 on the 10 m plateau. It has run for 272 seconds with no new removals;
its saved controller counter reports 14 cycles. Inspect actual poses/phase
conditions before treating that counter as proof of completed landings.
Next address [world cargo height](../20260915-043000-codex-01/TASK.md), so the loaded
lift experiment can be reproduced in the shared world, then test real transfer.
Preserve existing designs/cargo while adding varied larger flyers, walkers and
working island structures with bounded randomized feedback controllers.

### Owned services — recheck PIDs before stopping anything

| Service | PID | Address / script |
| --- | --- | --- |
| Preview | 104549 | `http://127.0.0.1:9099/blockwalker/`, `scripts/serve-gpu.mjs 9099 blockwalker` |
| Relay | 17316 | port 9010; allows origins 9099 and 19199 |
| Live browser runner | 17317 | CDP `http://127.0.0.1:9231`, `build/blockwalker-water-live.mjs` |
| Five-minute backup monitor | 137939 | `build/blockwalker-focus-monitor.mjs --watch` |

The session is **`blockwalker-focus`**, with persistent browser profile
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
conversation reached **154,898,320 bytes** at 19:19 UTC; its original
141,563,139-byte pre-migration SHA-256 prefix still matched after compaction and
subsequent tools. Pi recognized existing Tidelock ID 38 and resumed its dock
experiment without duplicating it. The live full-view image and real traces are
in `build/blockwalker-walking/focus-live-world.png`.

Latest recovery files are `focus-state.tar` (143,513,600 bytes),
`focus-state.tar.gz` (104,211,289 bytes) and three `focus-state-XX.part` files of
at most 48 MiB. They preserve 32 creatures at world age 15475.3333 s. Verified
restoration retained every ID and attachments to cargo 25, 31 and 35. Evidence:
`focus-restore-proof.json`, `focus-restored-proof.json` under the walking folder,
and `build/blockwalker-focus-restore-resume.log`.

For another migration, stop only the verified monitor, use
`build/blockwalker-magnet-pause.mjs` to pause Pi/exit to Slop, then run the current
monitor once to capture final files. Preserve a credential-free USTAR archive,
gzip/split as needed, and restore through the real browser file picker. The
complete corrected flow is `build/blockwalker-focus-restore.mjs`; it uses CDP's
file-input setter because Playwright's remote helper rejects files over 50 MB.
Use a fresh session name and restart its monitor after restoring. Verify IDs,
attachments, the full history prefix and actual Astra/xhigh continuation.

The 64 MiB file-transfer limits are separate from the removed HTTP request
limit. Reassemble with `cat /tmp/PARTS... | gzip -dc - | tar -xf - -C /workspace`;
this gzip requires the explicit stdin `-`. Remove imported temporary chunks
after success. Do not truncate history or add a host filesystem bypass. See
[streaming transfers](../20260915-030600-codex-01/TASK.md).

Older `*-state.tar` archives remain in the walking folder: checkpoint,
space-camera, water, navigation, magnet, magnet-carry, library, outposts and the
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
