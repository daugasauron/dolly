# Godot's editor is usable on both Godot games: their projects open and show, and its errors are gone or explained

- STATUS: CLOSED
- PRIORITY: 390
- TAGS: godot,editor,gpu,owner,0.1.6

Owner (2026-11-13): "For both airtime and the other godot game, when I Ctrl+C the games and open
them in godot editor, I don't see anything. I don't know how godot works at all so might be my
bad, but I thought I would see something. There are also a lot of errors and warnings in the
Console log, so I assume some things are not working. [...] Make it a task to go through both
godot games and look through these problems to see if the editor is actually working and usable."

The two games are `godot-airtime` (Q, or Ctrl+C, leaves a shell where
`godot-editor -e --path ~/airtime` opens its project) and `godot-lantern-drift` (the game with
the editor and a copy of its project). Presumably on the local release, 127.0.0.1:9045
(`973b3ad4…`, main `2b8036055`); the browser not recorded.

## What the owner's terminal showed when the editor exited (excerpt)

```
WARNING: SsilInterleaveShaderRD:2: the browser's WebGPU has no storage texture of format 61 with
access 1 (texture-formats-tier1 and tier2). Its dispatches do nothing here.
     at: compute_pipeline_create (platform/dolly/rendering_device_driver_webgpu.cpp:1879)
  (the same for VoxelGiShaderRD formats 39 and 1, SdfgiPreprocessShaderRD format 3,
   SdfgiIntegrateShaderRD format 38, BokehDofShaderRD format 39, all access 3)
ERROR: Condition "_sock == -1" is true. Returning: FAILED
   at: _inet_open (drivers/unix/net_socket_unix.cpp:288)
ERROR: Condition "err != OK" is true. Returning: ERR_CANT_CREATE
   at: listen (core/io/tcp_server.cpp:56)
  (twice)
WARNING: Keeping screen on not supported by this display server.
WARNING: Clipboard is not supported by this display server.  (twice)
```

## State (2026-11-13)

Seen in Chrome on the release of `2b8036055` (godot-airtime): Q, then `godot-editor -e --path
~/airtime` opens the editor with `main.tscn` open, and its 3D view shows only the camera's gizmo
on the grid. That is the "nothing": both games build their worlds in scripts as they start
(Airtime's `foundry.gd` and `pads.gd` from `main.gd`, Lantern Drift's `world.gd` from `main.gd`),
which the editor does not run. Selecting nodes, F5 (the game runs in the page and Q gives the
editor back, its debugger connected) and the Output and Debugger docks worked. The Output dock
showed the two TCP failures as the Debug Adapter server on port 6006 and the GDScript language
server on port 6005.

Done on `feature/x11-apps`, built in the round of 08:56:

- The builders are tool scripts (`@tool`, a `_ready` that builds when `Engine.is_editor_hint()`),
  so the editor's 3D view shows the course and the islands as the game starts in them; what they
  build there has no owner and is not saved with the scene. `island.gd`, `ring.gd` and
  `course.gd` are tool scripts too, as the builders instance and call them.
- TCP: the editor is built with `module_jsonrpc_enabled=no`, upstream's switch that leaves the
  language server out (JSON-RPC's one user), and `godot-dolly.patch` leaves the Debug Adapter
  server out on Dolly: both serve other editors over TCP, which Dolly does not have.
- Keeping the screen on: a no-op, as on Godot's web platform (`screen_set_keep_on`).
- Clipboard: `clipboard@0` (`20261112-221342-clipboard`); the editor's Ctrl+C is Copy, as it
  clears `ISIG` on its terminal while it has the page.
- Storage textures: the warning of a compute pipeline that cannot run here (Firefox has neither
  of WebGPU's texture format tiers: SSIL, VoxelGI, SDFGI, depth of field) now comes at its first
  dispatch, not at its creation: Godot makes those pipelines at startup whether a scene uses them
  or not, and neither game's environment turns them on.
- Each image's message at Q and its description (`demos/godot/README.md`) say the steps: open
  the project, the eye beside the HUD hides it, F5 plays the game so, Ctrl+S saves the scene.
- `demos/godot/test/godot-projects-browser.mjs` drives those steps and copy and paste in both
  games' projects, a probe plugin printing what the 3D view shows.

Run on the build of 10:28 (`build/godot-projects-check-{chromium,firefox}.log`, the error check
printed rather than asserted): in Chrome and Firefox, for both games, the editor opened
`res://main.tscn` with the world standing in it (Airtime 418 meshes, 2169 to 2388 colours in the
3D view; Lantern Drift 360 meshes, 740 to 775 colours), the HUD's eye hid it, F5 ran the game
without it (a second engine's banner in the log), Q gave the editor back, Ctrl+S saved, and the
copy and paste steps renamed two nodes. The log's one error was selecting the camera: its gizmo's
handle material names `gl_PointCoord`, which Tint does not read, so two pipelines failed (and, at
exit, freeing them and waiting for their compilations). `spirv-wgsl` now reads it as the centre of
WebGPU's one-pixel points (Godot emulates sized points with quads where the driver lacks point
size, so the built-in is in the branch not taken); a native build of the translator turned a
shader reading it whole and by component into `vec2(0.5)` and `0.5`.

Firefox once did not start Airtime's game within the test's 180 s while an image build ran beside
it; on the next run it started at once.

## Do

Open each game's project in the editor, in Chrome and Firefox, as the owner did; do what a new
user does (open the main scene, select a node, change a value, run the game with F5, save,
export); fix what does not work and quiet or explain each error and warning. Write down the steps
in each image's description, so a person who does not know Godot finds the game in it.

## Done when

In both browsers, for both games: the editor opens the project with its main scene shown, an edit
runs in the game from the editor and is saved, and the log has no error that a step needs.

## Closed (2026-11-13, `feature/x11-apps`)

`demos/godot/test/godot-projects-browser.mjs` passed in Chrome and Firefox on the build of 11:57
(with the `gl_PointCoord` fix, `a1ffd4e04`), its log check asserted: for both games the editor
opened `res://main.tscn` with the world standing in it (Airtime 418 meshes, 2067 colours in Chrome
and 2394 in Firefox; Lantern Drift 360 meshes, 777 and 747 colours), the HUD's eye hid it, F5 ran
the game so, Q gave the editor back, Ctrl+S saved `visible = false`, a node's name copied and
pasted renamed two nodes, and the editor's log had no error, TCP failure, keep-screen-on or
clipboard warning. Logs `build/godot-projects-chromium.log`, `build/godot-projects-firefox.log`;
screenshots `build/godot-{airtime,lantern-drift}-chromium-{run,renamed}.png`.
