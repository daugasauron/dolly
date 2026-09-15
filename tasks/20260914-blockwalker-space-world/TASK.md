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

## Current checkpoint — 2026-09-15 16:28 JST

Work only in `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-20260914`. No push/deploy/merge authorization. Continue until
22:00 JST (13:00 UTC). User's latest priority is a real two-legged walker.

Source checkpoint0dd742c adds **Sidelight IV - patrolling biped**, exact saved
Pi design#62, alongside Sidelight III and all older creations. The new image
contains53 objects/1461 parts and5a24f9c's early failed-practice stopping.
Dollyfile/module pins are updated and the fresh packaged image is verified.
C compiled inside Dolly in the20.3s app image build. Snapshot231950864bytes,
SHAc77091ad2f8d03d2f202e430eebcbcfec9c615f98a21b514c0e8c1362b328402;
source tar5ab2e55984f08910dac022fbd7dff4ff82e1b7cb633c89c84096d4645a7a077d.
Kernel unchanged:d39a823c5863d0b1c8508f0d78e61cfe2408144a9ddaa6ecd57919e320718d72.

Exact#62 completed600.05s in the populated world:41 alternating physical foot
placements, six direction reversals, no aborts/deaths, minup=.985948 and
maximum measured support-centroid movement=.018311m. Every placement had signed
airborne advance>.4125m while the other foot carried ground impulses. Root Z
range[-1.9644,2.0762]m. Contacts were sampled about.1s, not every tick; some
opposite-leg rubbing remains (peak1.1658Ns), no dynamic external impulses.
All sources/bodies and full saved-world poses/velocities/memory reopened exactly.
Evidence: `build/blockwalker-patrol-clear-world/` has proof/report/restored JSON,
three GPU frames and30s video `patrol-world.webm`. Handle40793 terminal0.

The new packaged image passed a fresh20s browser check:53/1461, no removals,
exact bundled source and biped body, advancing upright, zero model requests.
Evidence: `build/blockwalker-patrol-packaged/`; handle80249 terminal0. The first
helper failed before startup by reading an undefined global; it was fixed and
its leftover owned scope stopped. Image-build handle83278 terminal0. No
ephemeral test/build browser remains. Do not repeat these tests without a change.

### Live session and next work

Actual Astra/xhigh Pi released exactly one unchanged#62 as world **#67**, at
(55,-85), seed6701, preserving all52 prior live objects and14 removal records.
At the paused checkpoint it was upright at146.067s. The live world is53 objects/
1390 parts. All65 archived designs remain, with73 saved variants at the07:23
export. Live#67 reached3046.483s (50.8 min), upright,211 controller-scored
placements,28 reversals and no aborts. These later counters are not a new
independent geometry audit. Latest experiments extend exact#62 with articulated
arms; see the [arms issue](../20260915-160000-codex-01/TASK.md).

The tighter-patrol experiments remain unpromoted. Library#64 passed its private
300s run but independently exceeded the requested bound at+1.6307m over600s.
Its41 physical placements/seven reversals had no aborts or falls. Library#65's
backward-first start worsened bounds; reshaped-foot#69 completed300s with six
abort-counter events and1.47m centroid drift. All are saved. See the
[bounds/contact issue](../20260915-153500-codex-01/TASK.md).

Straight live walkers#64/#65/#66 fell naturally after144.07/77.54/32.34 minutes.
#64 reached the sea; #65/#66 initiating causes remain unknown. Designs and
removal records remain, without rewinding. Earlier#62's collision with foreign
#22 was independently reproduced/controlled; don't attribute later falls to
that cause. See [late-fall issue](../20260915-110000-codex-01/TASK.md).

The game and Pi resumed as **blockwalker-patrol** on the new image. Old
**blockwalker-bipeds** remains. Restore67073 and hash/compatibility verifier66319
are terminal0: all archived workspace hashes match and the new session is
compatible. Real Astra/xhigh requests resumed at06:34:54UTC. The
post-resume proof verifies its entire374481137-byte native prefix; history is
now374504337bytes. All53 live creations and65 older designs remain, with14
removals. #67 reached376.183s,25 scored placements,3 reversals, no aborts and
.018086m maximum stance slip. Pi received the complete834-character prompt
in patrol-continuation-prompt.txt; patrol-continuation-proof.json records it. Continue
[the tighter bounds/contact task](../20260915-153500-codex-01/TASK.md); its
600s independent #64 browser has finished (95710 terminal0), with41 physical
placements/seven reversals/no falls but a FAILED bound check (+1.6307m). All
evidence is in blockwalker-reserved-clear-world/. No test browser remains.
Pi received those results and the next [arms task](../20260915-160000-codex-01/TASK.md),
starting from verified#62 and preserving the failed foot experiments. Current
steering scripts are blockwalker-{reserved-results,arms}-steer.mjs; do not rerun
the old834-character-prompt equality check against later configuration.
Pi's first arm body#71 passed a5s standing check. Walking version#72 stayed
upright for300s but had three aborts and .462m maximum controller stance drift.
A separate90s C diagnostic confirmed hand/hip contacts up to2.995Ns; no sampled
arm-ground or dynamic external impulses. Handle3259 is terminal0 and its4GiB
scope inactive; evidence is in blockwalker-arms-collision-world/. Raised
forward/aft variant#73 tipped in practice. No arm body has been released.
Pi received737characters of measured contact data and is now building symmetric
outward shoulder spacers (37 parts/16 joints). Prepared helpers
blockwalker-arms-{browser,check,reopen}.mjs and arms-analysis.py are for the
required300s independent successor check; they have NOT been run and need an
exact normalized seed in blockwalker-arms-current-seed.json. All original
foot indices10..15/23..28 must remain unchanged for that analysis.

No new production physics sensor, engine change or image rebuild occurred in
this arm iteration. Do not use __dolly.visibleTerminalText() as a periodic
observer during graphical apps: it synthesizes mouse input. Use screenshots.
The executed old tighter-patrol helper is preserved separately with the
-terminal-poll suffix; future helpers have no such timer.

### Owned services and recovery

Recheck PIDs before stopping anything; other worktrees/previews belong to others.
Preview104549: `node scripts/serve-gpu.mjs 9099 blockwalker`.
Relay17316: port9010, permits origins9099 and19199.
Live browser440769: CDP9231, `build/blockwalker-bipeds-live.mjs`, DISPLAY=:1,
profile `.cache/blockwalker-browser-20260915`. Its restart URL now points to
blockwalker-patrol. Monitor519049 runs `blockwalker-patrol-monitor.mjs --watch`;
497976 is stopped. It exports complete native history in8MiB binary chunks,
plus immutable five-minute world snapshots under `world-snapshots/`.
Stop watch monitors before manual exports; they share a browser scratch buffer.

Latest complete archive: `build/blockwalker-walking/patrol-state.tar`,
376268800bytes; gzip277748061bytes; six48MiB `patrol-state-XX.part` chunks.
It contains53 live objects,65 designs,14 removals at world49849.05000308718,
plus374481137bytes/2039 entries of complete native Pi history. History SHA:
ed5cede13df8e3c14035b64ba5e266a0cd664720f3d5dbc80e1ae15b8f9dc1b6;
its whole373235451-byte preceding prefix was verified. Manifest:
`patrol-restore-proof.json`; restore/verify helpers `blockwalker-patrol-*.mjs`.
Archives exclude models/auth. Private relay config remains
`/tmp/dolly-codex-relay-Bez6Lp/models.json`; never print or commit it.

Current-state mirror/progress/screenshots remain in `build/blockwalker-walking/`.
Status helper: `python3 build/blockwalker-biped-status.py`. Old bipeds-state,
biped-checkpoint-state and endurance-state archives remain. Old package files
are in `build/blockwalker-pre-patrol-package/`. Named sessions are browser-profile
local; another browser cannot load this session just from its URL. Reassemble
archive chunks inside Dolly: `cat /tmp/PARTS... | gzip -dc - | tar -xf - -C /workspace`.
Always use explicit gzip stdin `-`. Don't truncate history or bypass file uploads.

Scripts importing relatives through build need
`node --preserve-symlinks-main build/NAME.mjs`. Resume only after GPU is active
AND frame count advances past the pre-start counter. Enabled Pi sessions can
take minutes to read native history; don't repeat the old60s startup timeout.
Ensure the Pi panel is visibly open before typing. Do not add a global download
handler alongside explicit consumers; duplicate handlers previously killed the
browser. Save the named session before downloading verification files.

Only one ephemeral browser at a time, entire process tree under4GiB/no swap:
`systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0 timeout --signal=TERM --kill-after=5s 180s xvfb-run -a node test/blockwalker-browser.mjs`.
Do not call visibleTerminalText during GPU mode: it selects text via pointer
events and can toggle the game UI. Use screenshots for live observation.
Never deep-assert image/binary Buffers; use `.equals()` boolean. Keep60Hz physics:
120Hz reduced flex but regressed boats. No host C builds or new host authority.
Read [crash handoff](../../docs/crash-handoff.md). An earlier desktop-freeze
interval was lost; later migrations preserve all provided history. No GPU or
driver fault was established. Older narratives remain in repository history.

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
