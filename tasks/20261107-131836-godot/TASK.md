# Godot 4.7 in Dolly: headless first, then the Compatibility renderer on Mesa, then a driver for gpu@0

- STATUS: OPEN
- PRIORITY: 200
- TAGS: demo,port

Owner (2026-11-07): "is it feasible to add the godot game engine?", then "Store all of these
things as tatr tasks, then start the work on godot and work on that overnight."

## What Godot needs (read 2026-11-07, not measured)

- Godot 4.7.2 is the newest release. It builds with SCons, which is pure Python (Dolly's CPython
  runs it), and a C++17 compiler (Dolly's clang 22); it carries its third-party libraries in its
  tree. It uses threads (`threads@0`) and can build without them.
- No platform fits as it is: `platform/web` is Emscripten's JavaScript and WebGL glue, and
  `platform/linuxbsd` assumes Linux with X11 or Wayland; AGENTS.md's porting rules say not to
  claim Linux. A `dolly` platform of Dolly's own, added beside upstream's in the build tree as
  Xonotic's and 0 A.D.'s Dolly files are: the OS layer on `drivers/unix` (POSIX), a display
  server on `display@0` and `input@0`, sound on `audio@0`.
- Rendering, three steps:
  1. Headless (`--headless`): GDScript, scenes, game logic and the export tools without drawing,
     on the headless display server and the dummy audio driver. The first proof.
  2. The Compatibility renderer: OpenGL ES 3 on Dolly's Mesa (the one Ghostty's GTK application
     renders through, softpipe on the CPU): 2D, slowly; 3D slower.
  3. A RenderingDevice driver for `gpu@0`, as 0 A.D. and Xonotic have backends: Godot compiles
     its shaders to SPIR-V, Dolly's `naga` package translates SPIR-V to WGSL; core WebGPU has no
     push constants, so the Mobile renderer first. Weeks.
- Size: about 0 A.D.'s; a build inside Dolly takes hours in a tab, within a process's 8 GiB.

## Done when

1. `demos/godot` builds Godot from its pinned release inside Dolly, and `godot --headless`
   runs a GDScript project there, with a browser test.
2. A 2D project draws through the Compatibility renderer, its frame rate measured.
3. Whether to write the `gpu@0` driver is decided on those measurements.
