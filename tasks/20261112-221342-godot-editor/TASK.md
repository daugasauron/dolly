# Godot's editor is usable on both Godot games: their projects open and show, and its errors are gone or explained

- STATUS: OPEN
- PRIORITY: 390
- TAGS: godot,editor,gpu,owner

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

Filed; nothing tried. Read so far, not measured:

- "I don't see anything": an editor opened on a project shows no scene until one is opened; the
  FileSystem dock opens a scene by double click, which Godot in Dolly did not take until
  `20261112-111000-godot-double-click` (on main since `2b8036055`). Whether the editor opens the
  project's main scene, and draws it in the 3D or 2D view, is the first thing to see.
- The storage-texture warnings: compute passes that need a storage format WebGPU's core lacks
  (texture-formats-tier1 and tier2) do nothing: SSIL, VoxelGI, SDFGI and depth-of-field. Which of
  them the two projects or the editor's own view use, and what is missing on screen.
- The two TCP `listen` failures: the editor's debugger listens on a local socket (the patch,
  `demos/godot/README.md`), so these are other editor servers, likely the GDScript language
  server and the debug adapter, which have no TCP here.
- Clipboard: `20261112-221342-clipboard`. Keeping the screen on: harmless.

## Do

Open each game's project in the editor, in Chrome and Firefox, as the owner did; do what a new
user does (open the main scene, select a node, change a value, run the game with F5, save,
export); fix what does not work and quiet or explain each error and warning. Write down the steps
in each image's description, so a person who does not know Godot finds the game in it.

## Done when

In both browsers, for both games: the editor opens the project with its main scene shown, an edit
runs in the game from the editor and is saved, and the log has no error that a step needs.
