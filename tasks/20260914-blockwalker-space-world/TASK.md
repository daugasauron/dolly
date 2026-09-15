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

## Current checkpoint — 2026-09-15 13:24 JST

Work only in `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-20260914`. No push/deploy/merge authorization; continue until
22:00 JST. Prior checkpoint is 47468d1; this checkpoint adds the verified faster
biped, direct experiment saving and readable Pi traces.

The image now contains **51 objects/1403 parts**, adding **Sidelight II - balanced
biped** alongside all 50 unchanged earlier entries. Its exact XXXVI-R source
passed a populated 300 s test: 18 alternating physical placements, 7.2081 m
forward versus original 5.7034 m (+26.4%), minimum up .9872, maximum stance slip
.02104 m, no removals, and exact 51-object reload. Both feet sometimes rub;
temporary C contact diagnostics found no external contact during ground-clear
intervals. See [faster gait](../20260915-102900-codex-01/TASK.md) and the separate
[cleaner-stride follow-up](../20260915-131400-codex-01/TASK.md).

The image build and updated `test/blockwalker-agent-browser.mjs` passed. Snapshot
231908622 bytes, SHA prefix f150fffbc7cd4ef3; source tar e4cc5df9d3a4d15e012c42b5dea0864b714e193a48008d6f4346f690aa89401e.
Kernel remains d39a823c5863d0b1c8508f0d78e61cfe2408144a9ddaa6ecd57919e320718d72.
C compiled inside Dolly; no host C build or authority change. App-only build
20.9 s. The new [save_design tool/library button](../20260915-122000-codex-01/TASK.md)
and [word-wrapped trace panel](../20260915-122100-codex-01/TASK.md) are packaged.
Actual Pi already saved XL as library #45 before opening Sidelight II #44.

The live world has **54 objects/1419 parts** and eleven removals. Actual Pi
saved current XLI as library #46, opened verified Sidelight II #44 and released
exactly one copy as **#65**, seed6501, at (75,-85). At the 04:22 UTC snapshot,
#65 was upright at age65.983 s, with1.1308 m forward travel, three scored steps
and no aborts. Source and blueprint match the verified bundled design exactly.
All 53 prior IDs/sources/blueprints and all 52 library entries remain. Original
#64 reached age3837.1 s (64 minutes), x86.293,z-3.492,up=.999903. Its earlier
54.6-minute checkpoint had69.5323 m forward and185 controller-scored placements;
do not claim every later placement was geometrically rechecked. #62's late fall
is strongly linked to contact with #22; #63's initiating cause remains unknown.
Keep both records ([late-fall issue](../20260915-110000-codex-01/TASK.md)).

### Live continuation and next work

Session **blockwalker-bipeds** is running actual **gpt-6-astra/xhigh** through the
owned relay. `build/blockwalker-walking/bipeds-release-proof.json` and
`bipeds-image-continuation-proof.json` verify the new release, all older designs,
the complete 966-character steering prompt, ten real Astra/xhigh requests and
**358980658 bytes of native history**, retaining its entire355431228-byte earlier
prefix. Status: `python3 build/blockwalker-biped-status.py`. Screenshots:
`build/blockwalker-walking/{latest,bipeds-release}.png`.

Saving experiments and trace wrapping are closed and verified. Six historical
sources are recovered as library #47-52, current XLI is #46, XL #45, and the
public successor #44. The same-pose recovery kept all53 creature states, all
older library entries and the workshop exact. These sources and complete history
are in the bipeds archive below. Pi continues XLI/cleaner-foot-clearance practice;
keep new experiments separately saved. Next local improvement is
[early physical-failure completion](../20260915-122200-codex-01/TASK.md), still
unimplemented. Keep successful300s trials and world failure rules unchanged.

A helper's duplicate download consumers closed an earlier browser with an
unhandled ENOENT. The recovery was repeated, saving BEFORE the proof download
with one explicit consumer. The current browser helper has no automatic download
handler. Saved enabled Pi sessions can spend minutes synchronously loading their
full history before frames/input advance. A60-second GPU-start timeout killed
one attempted restart; do not repeat it. For a restart, wait for active GPU and
frame count advancing beyond its previous value, then verify the Pi panel is
visible before typing. Old frame counters can survive a process exit. The final
966-character prompt was verified intact after following those UI steps.

### Owned services — verify PIDs before stopping anything

| Service | PID | Address / script |
| --- | --- | --- |
| Preview | 104549 | `http://127.0.0.1:9099/blockwalker/`, `scripts/serve-gpu.mjs 9099 blockwalker` |
| Relay | 17316 | port 9010; permits origins 9099 and 19199 |
| Live browser | 440769 | CDP 9231, `build/blockwalker-bipeds-live.mjs` |
| Five-minute monitor | 446330 | `build/blockwalker-bipeds-monitor.mjs --watch` |

Persistent Chrome profile: `.cache/blockwalker-browser-20260915`, DISPLAY=:1.
The old live runners17317/439890 and monitors387963/443288 are stopped. Scripts
under the build symlink require `node --preserve-symlinks-main build/NAME.mjs`.
The private relay config is `/tmp/dolly-codex-relay-Bez6Lp/models.json`; never
print or commit it. Request logs record only model/effort/timing/size.

### Recovery files and verification

`build/blockwalker-walking/current-state/` mirrors world, workshop, Pi config,
events and the COMPLETE native session JSONL. Models/auth are excluded from
host archives. The monitor exports in 8 MiB binary chunks; never revive the old
monolithic monitor (256 MiB WebSocket failure). Stop a watch monitor before any
manual full export. `progress.json` updates only after all files finish.

Latest complete archive: `bipeds-state.tar` (357171200 bytes), gzip263893321 bytes,
six48MiB `bipeds-state-XX.part` files, mode600. It contains all52 library entries,
53 objects at world42513.416668 and **355431228 bytes/1853 native JSONL entries**,
SHA256 `9bff929b019a74a2b4d57fe41fb550d0aa6c941c2afa244327cf134fa3918454`.
It predates #65; the rolling mirror/named session are newer and include that
release. `bipeds-restore-proof.json` records all file hashes and the verified
354579335-byte preceding history prefix. Earlier `biped-checkpoint-state.*` and
`endurance-state.*` archives remain unchanged.

Restore/verify scripts are `build/blockwalker-bipeds-{restore,verify}.mjs`; they
use a fresh `blockwalker-bipeds-recovered` name. Adapt the name on a later reuse.
Reassemble inside Dolly with `cat /tmp/PARTS... | gzip -dc - | tar -xf - -C /workspace`.
Do not truncate history or bypass the browser file picker. Source-only app
updates can compile in place (`blockwalker-endurance-update.mjs`). Avoid another
full image/history migration for a small source-only iteration.

All older archives/named sessions remain. An interval lost during the earlier
desktop freeze after the old water checkpoint was never recovered; later full
input histories have been preserved. No GPU/driver fault was established for
that freeze; read [the crash handoff](../../docs/crash-handoff.md).

Only one ephemeral browser at a time, entire tree under 4 GiB/no swap:

```sh
systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0 \
  timeout --signal=TERM --kill-after=5s 180s \
  xvfb-run -a node test/blockwalker-browser.mjs
```

Use meaningful checks for the changed behavior; do not repeat unrelated suites.
Never deep-assert binary Buffers; use `.equals()` boolean comparisons. All current
ephemeral tests are finished. [Early failed-trial completion](../20260915-122200-codex-01/TASK.md)
is investigated but not implemented. Keep the current 60 Hz constraints: the
120 Hz comparison reduced flex but regressed boat navigation ([issue](../20260915-093700-codex-01/TASK.md)).

Other verified additions: [landers](../20260915-045200-codex-01/TASK.md),
[basalt basin](../20260915-051000-codex-01/TASK.md), [survey/salvage](../20260915-055500-codex-01/TASK.md),
[expeditions/recovery](../20260915-064000-codex-01/TASK.md), [controller budget](../20260915-065100-codex-01/TASK.md),
[render profiling](../20260915-060200-codex-01/TASK.md), [timer scheduling](../20260915-062600-codex-01/TASK.md),
[bounded memory inspection](../20260915-080400-codex-01/TASK.md).
Older checkpoint narratives are in repository history at b87089f and 47468d1.

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
