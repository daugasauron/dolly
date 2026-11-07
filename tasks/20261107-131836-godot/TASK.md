# Godot 4.7 in Dolly: headless first, then the Compatibility renderer on Mesa, then a driver for gpu@0

- STATUS: OPEN
- PRIORITY: 200
- TAGS: demo,port

Owner (2026-11-07): "is it feasible to add the godot game engine?", then "Store all of these
things as tatr tasks, then start the work on godot and work on that overnight."

## State (2026-11-08)

Steps 1 and 2 are done on `demo/godot`, and so are the editor and a game exported by it.
`integrate/0.1.6` has the engine (`9b95ee67f`); the editor and the game follow once its round ends.
`demos/godot/test/godot-browser.mjs` and `godot-editor-browser.mjs` passed in Chromium and Firefox
(`2e01b91aa`). That is not yet a full round.

- **Step 1, headless:** `demos/godot` builds Godot 4.7.2 from its release inside Dolly, and
  `godot --headless` runs a project.
  - `demos/godot/test/godot-browser.mjs` passed in Chromium (2.6 s) and Firefox (3.4 s): GDScript,
    a signal, the scene tree, a sleep against the clock, a timer, JSON under `user://`, user
    arguments and the exit status. The output matches Godot's own Linux build.
  - A GDScript benchmark took 1.19 s in Chrome and 0.32 s natively.
- **Step 2, the Compatibility renderer:** `godot --path DIR` draws on the page.
  - `demos/godot/platform/display_server_dolly.cpp` is a display server on `display@0` and
    `input@0`, with an OpenGL 3.3 core context on Mesa's surfaceless EGL (softpipe, linked in from
    `mesa-build`). Godot draws into a pbuffer; each frame is read back and presented.
  - The build compiles 761 units and links the first time: 5 min 43 s at four jobs in a session.
  - A scene of a background, a textured sprite and a label draws at 11.7 frames a second at
    640x360, and 42.2 at 320x180, with or without vsync (Chrome headless). Softpipe bounds it.
  - Its frame matches Godot's Linux build on llvmpipe within rounding: 5,366 of 230,400 pixels
    differ, 111 by more than 32 levels, all in the label's text.
  - The test draws that scene at 12.0 frames a second in Chromium and 12.8 in Firefox. It waits for
    the scene on the canvas and sends a key and a click, which the script reports. The script then
    checks pixels of its frame.
- **Sound:** `audio_driver_dolly.cpp` plays Godot's mix through `audio@0`. A thread keeps 100 ms
  queued ahead of the page. The test hears a tone on the right channel only.
- **The editor:** `godot-editor` (`Dollyfile-godot-editor`) is the release with Godot's default
  modules, 2,561 units, built in the image build in 26 minutes: 182 MB.
  - Two modules are left out. Basis Universal's encoder names `sys/timex.h`, which Emscripten's
    libc and Dolly's leave out. Jolt Physics knows WebAssembly only as Emscripten; 3D physics is
    Godot's own.
  - It imports a project's assets and exports its pack inside Dolly. Its debugger and language
    server find no sockets and say so.
  - `godot-editor --editor --path DIR` opens the editor itself on the page: its scene tree, file
    system, inspector and 2D and 3D views of the game's scene
    (`work/godot/build/editor-2d-2026-11-08.png`). A click on the 2D or 3D tab showed its view within
    2 s (Chrome headless, beside an image round). No test covers it.
- **A game:** `dodge-the-creeps` is the demo projects' release game (Godot's first 2D tutorial).
  - The editor imports and exports it while the package builds; `dodge-the-creeps` plays it on the
    page with sound.
  - The template packages Ogg Vorbis, MP3, WebP and regular expressions for such packs.
  - `godot-editor-browser.mjs` exports an SVG through the editor and runs the pack, then starts the
    game and sees its score count: Chromium 18.2 s, Firefox 20.2 s.
- **Found in the substrate**, fixed on their own branches and merged into `integrate/0.1.6`:
  - `CLOCK_MONOTONIC_RAW` and the coarse clocks were refused (`76075ee89`).
  - The extended-attribute calls were missing; they now fail with `ENOTSUP` (`6e776414b`).
  - The display, input, touch and upload headers broke C++ before `<atomic>` (`194ecb00b`).
  - `cc` refuses `-s` (`tasks/20261107-134832-cc-strip`, waits for the compiler round).
  - SCons finds a compiler only by its execute bit, which Dolly keeps none of; the platform
    names it.
  - The page stretched a frame of another shape than the page; it now fits it, and the pointer maps
    to it (`tasks/20261107-182201-frame-aspect`, closed, on `demo/godot`).
- **Step 3, decided on these numbers: not now.** Softpipe already draws a simple 2D scene at 12
  frames a second at 640x360. A RenderingDevice driver on `gpu@0` would take weeks: Godot has no
  WebGPU backend upstream, its shaders are SPIR-V for `naga`, and core WebGPU has no push
  constants.
- **Left:**
  - The page's surface size and resizes, since Godot keeps the project's window size.
  - A test of the editor's own window on the page.
  - `godot` in the release round's demo list.

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
