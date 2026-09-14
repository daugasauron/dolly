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
