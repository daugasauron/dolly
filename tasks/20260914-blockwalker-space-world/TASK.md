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
browser still runs the water checkpoint until its next safe migration.
