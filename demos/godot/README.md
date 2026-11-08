# Godot

Godot 4.7 from upstream's release, built inside Dolly by SCons with Dolly's
`cc`, as the `godot` package, with one patch
([`godot-dolly.patch`](godot-dolly.patch)): it names Dolly's WebGPU driver to
Godot, and Forward+ starts SDFGI only where the device has image atomics,
which WebGPU does not (SDFGI also needs more storage textures than WebGPU
gives a shader stage). `amy install godot`, then
`godot --path DIRECTORY` runs a project on the page, drawn by Godot's
Mobile and Forward+ renderers through a RenderingDevice driver on `gpu@0`
where the browser grants WebGPU, and by its Compatibility renderer on Mesa's
OpenGL otherwise, and `godot --headless` runs one without drawing; `--script FILE` runs a script in the project of the
current directory. Its sound plays through `audio@0`. `godot-editor` is
Godot's editor: it imports a project's assets and exports its pack inside
Dolly, as it exported Dodge the Creeps for `amy install dodge-the-creeps`
([task](../../tasks/20261107-131836-godot/TASK.md)).

## Images

- `godot`: Godot 4.7's engine with GDScript, 2D and 3D with Godot's own physics, the fallback text server, its renderers on `gpu@0` and the Compatibility renderer on Mesa, and sound, which runs a project or the pack the editor exported.
- `godot-editor`: Godot 4.7's editor, which imports a project's assets and exports its pack inside Dolly, and draws its own window on the page.
- `spirv-wgsl`: A build stage: Tint, from Dawn, and SPIRV-Tools under Dolly's passes, which translate the SPIR-V Godot compiles its shaders to into WGSL for `gpu@0`.
- `dodge-the-creeps`: Dodge the Creeps, the game of Godot's first 2D tutorial, which Godot's editor imported and exported here; `dodge-the-creeps` plays it.
- `truck-town`: Truck Town, the demo projects' vehicle physics demo: a minivan, a semi-truck and a tow truck in a town at four times of day, drawn by Godot's Forward+ renderer on `gpu@0`; `truck-town` plays it.

## Building

Godot's build is SCons over its own platforms, each a directory of
`platform/`. Dolly's is [`platform/`](platform), placed as `platform/dolly`
([`prepare-sources.sh`](prepare-sources.sh)):

- [`detect.py`](platform/detect.py) names Dolly's `cc`, `c++` and `ar`
  (LLVM's, which writes its own index, so no ranlib), the `wasm64`
  architecture, an export template's build (`template_release`) and the
  Compatibility renderer, with Mesa's EGL and its softpipe driver linked in,
  beside the RenderingDevice driver on `gpu@0`
  ([`rendering_device_driver_webgpu.cpp`](platform/rendering_device_driver_webgpu.cpp),
  [task](../../tasks/20261108-040718-godot-gpu/TASK.md)) and the translator of
  Godot's SPIR-V into WGSL ([`spirv-wgsl`](spirv-wgsl)).
- [`os_dolly.cpp`](platform/os_dolly.cpp) is the operating system as Godot
  sees it: Godot's Unix driver for files, clocks and processes, Dolly's name
  and feature (`OS.has_feature("dolly")`), the program's path from
  `/proc/self/exe`, the XDG directories as on Linux, and the main loop, which
  runs until the project quits. [`godot_dolly.cpp`](platform/godot_dolly.cpp)
  is `main`.
- [`display_server_dolly.cpp`](platform/display_server_dolly.cpp) is the
  window: the page's canvas through `display@0`, keys, text, the pointer and
  the wheel of `input@0` (keys mapped by Godot's web platform's table), and an
  OpenGL 3.3 core context on Mesa's surfaceless EGL platform. Godot draws into
  a pbuffer of the window's size; each frame is read back, turned upright and
  presented, and with vsync Godot then waits for the page's next animation
  frame.
- [`audio_driver_dolly.cpp`](platform/audio_driver_dolly.cpp) plays Godot's
  mix as `audio@0`'s stereo float PCM at 48 kHz: a thread of its own keeps
  100 ms queued ahead of the page, as the SDL port does.
- [`SCsub`](platform/SCsub) links the program, with Godot's GLAD loader,
  which takes OpenGL's functions from `eglGetProcAddress`.

The recipe builds on `mesa-build` ([Ghostty's GTK demo](../ghostty-gtk/README.md))
and leaves out the modules a 2D project does not need
(`modules_enabled_by_default=no`): GDScript, 2D physics and the fallback
text server with FreeType, and no 3D, 761 units in place of Godot's 2,097.
In a session in Chrome they compiled in 5 min 43 s at four jobs. A GDScript
loop of primes and dictionary updates took 1.19 s in Chrome and 0.32 s in
Godot's own Linux build (2026-11-07).

Softpipe runs every shader in its interpreter on the CPU: a scene of a
background, a textured sprite and a label draws at 11.7 frames a second at
640 by 360 and 42.2 at 320 by 180, with or without vsync (Chrome, 2026-11-08);
in the test, 12.0 in Chromium and 12.8 in Firefox.
Its frame matches the one Godot's Linux build draws on llvmpipe except for
rounding: 5,366 of 230,400 pixels differ, 111 by more than 32 levels, all in
the label's last two words.

The editor ([`Dollyfile-godot-editor`](Dollyfile-godot-editor)) is the same
release on the same platform with Godot's default modules, 2,561 units,
less two: Basis Universal, whose encoder names a header of Linux's that
Emscripten's libc and Dolly's leave out (`sys/timex.h`), and Jolt Physics,
which knows WebAssembly only as Emscripten (3D physics is Godot's own). It
compiled in 26 minutes in the image build, a 182 MB program. Its debugger and
language server find no sockets and say so. The template packages the
modules an exported 2D game loads beside the engine's: Ogg Vorbis, MP3, WebP
and regular expressions.

[`Dollyfile-dodge-the-creeps`](Dollyfile-dodge-the-creeps) takes the game
from the demo projects' release as published, gives it an export preset,
which the release does not carry, and has the editor import its assets and
export its pack while the package builds.

What the platform decides ([process model](../../docs/process-model.md)):

- Threads: Mesa is built with `-pthread`, so Godot is too (`threads@0`).
- One window, the page's canvas, which scales the frame; Godot's window
  size is the project's.
- An export template runs only the pack beside it unless it is built with
  `disable_path_overrides=no`, which lets `--path` and `--script` name a
  project. A project the editor has not imported has no
  `.godot/global_script_class_cache.cfg`; the template says so ("Could not
  load global script cache") and runs it.
- Godot strips a release with `-s`, which the seed's `cc` does not take yet
  ([task](../../tasks/20261107-134832-cc-strip/TASK.md)); the platform takes
  it out of the link flags.
- Godot reads `CLOCK_MONOTONIC_RAW` where the headers define it, and its
  Unix file access links the extended-attribute calls: Dolly's libc reads
  that clock from the monotonic one and fails the calls with `ENOTSUP`.
- SCons takes a compiler on `PATH` only by its execute bit, which Dolly does
  not keep; the platform names the compiler.

Test: [`test/godot-browser.mjs`](test/godot-browser.mjs) installs the
package into `default`, runs a project headless whose script computes,
emits a signal, adds a node, sleeps, waits on a timer, writes and reads JSON
under `user://` and quits with a status of its choosing. Then a 2D scene
draws on the page: the test waits for it on the canvas, hears its tone on the
right channel only, sends a key and a click that its script reports, and the
script checks pixels of its frame, in Chromium and Firefox.

[`test/godot-editor-browser.mjs`](test/godot-editor-browser.mjs) installs the
editor and the game: the editor imports an SVG into a project and exports
its pack, which `godot` runs; the game shows its title on the page and
starts on Enter, its score counting; and the editor opens its own window on
the page and shows its 2D view at a click on the tab, in Chromium (46.3 s)
and Firefox (50.4 s).

[`test/godot-gpu-browser.mjs`](test/godot-gpu-browser.mjs) runs Godot's
RenderingDevice on `gpu@0` (`platform/rendering_device_driver_webgpu.cpp`) on
a hardware adapter, in Chrome and the installed Firefox on a display: a 2D
scene on the Mobile renderer, a 3D scene with a sky, light and shadow, and
the editor, each reading its own frame back.
