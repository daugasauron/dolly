# Godot 4.7 in Dolly: headless first, then the Compatibility renderer on Mesa, then a driver for gpu@0

- STATUS: OPEN
- PRIORITY: 200
- TAGS: demo,port

Owner (2026-11-07): "is it feasible to add the godot game engine?", then "Store all of these
things as tatr tasks, then start the work on godot and work on that overnight."

## State (2026-11-08)

Step 1 is done on `demo/godot` (`work/godot`): `demos/godot` builds Godot 4.7.2 from its release
inside Dolly, and the `godot` package runs a project with `godot --headless`.
`demos/godot/test/godot-browser.mjs` passed in Chromium (2.6 s) and Firefox (3.4 s). The project
covers GDScript, a signal, the scene tree, a sleep against the clock, a timer, JSON under
`user://`, user arguments and the exit status. Its output matches Godot's own Linux build.
- The build: SCons (the new `scons` package, `demos/tools`) on a `dolly` platform of Dolly's own
  (`demos/godot/platform`). It compiles 737 units: GDScript, 2D physics and the fallback text
  server, with no 3D and no renderer. In the image build they compiled in 4 min 54 s at four jobs,
  in Chrome, and linked a 48 MB program.
- A GDScript benchmark took 1.19 s in Chrome and 0.32 s natively.
- One thread (`threads=no`). `disable_path_overrides=no`, so `--path` and `--script` name a project.
- What it found in the substrate, fixed on their own branches, merged into `integrate/0.1.6`:
  - `CLOCK_MONOTONIC_RAW` and the coarse clocks were refused, so Godot's ticks stayed 0
    (`76075ee89`).
  - The twelve extended-attribute calls were missing; they now fail with `ENOTSUP` (`6e776414b`).
  - `cc` refuses `-s` (`tasks/20261107-134832-cc-strip`, waits for the compiler round).
  - SCons finds a compiler only by its execute bit, which Dolly keeps none of: a `SConstruct`
    names it (README).
- Left for step 2: the Compatibility renderer.
  - A `DisplayServer` on `display@0` and `input@0`, as the SDL2 port's `SDL_dollyvideo.c` is.
  - A GL context from `mesa-build`'s static EGL and softpipe (surfaceless, read back each frame).
  - Godot built with `opengl3=yes` and threads, since Mesa is built with `-pthread`.

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
