# Godot

Godot 4.7 from upstream's release, unchanged, built inside Dolly by SCons
with Dolly's `cc`, as the `godot` package: `amy install godot`, then
`godot --headless --path DIRECTORY` runs a project, and
`godot --headless --script FILE` a script in the project of the current
directory. GDScript, the scene tree, signals, timers, files under `user://`
and the main loop run; nothing is drawn and nothing is heard yet
([task](../../tasks/20261107-131836-godot/TASK.md)).

## Images

- `godot`: Godot 4.7's engine with GDScript, 2D physics and the fallback text server, without 3D or a renderer; it runs a project with `--headless`.

## Building

Godot's build is SCons over its own platforms, each a directory of
`platform/`. Dolly's is [`platform/`](platform), placed as `platform/dolly`
([`prepare-sources.sh`](prepare-sources.sh)):

- [`detect.py`](platform/detect.py) names Dolly's `cc`, `c++` and `ar`
  (LLVM's, which writes its own index, so no ranlib), the `wasm64`
  architecture and an export template's build (`template_release`).
- [`os_dolly.cpp`](platform/os_dolly.cpp) is the operating system as Godot
  sees it: Godot's Unix driver for files, clocks and processes, Dolly's name
  and feature (`OS.has_feature("dolly")`), the program's path from
  `/proc/self/exe`, the XDG directories as on Linux, and the main loop, which
  runs until the project quits. [`godot_dolly.cpp`](platform/godot_dolly.cpp)
  is `main`.
- [`SCsub`](platform/SCsub) links the program.

The recipe leaves out the modules a project of text and GDScript does not
need (`modules_enabled_by_default=no`): GDScript, 2D physics and the
fallback text server with FreeType, and no 3D, 737 units in place of
Godot's 2,097. In the image build (Chrome, four jobs) they compiled in
4 min 54 s and linked in 5 s, a 48 MB program (2026-11-07). A GDScript loop
of primes and dictionary updates took 1.19 s in a session in Chrome and
0.32 s in Godot's own Linux build.

What the platform decides ([process model](../../docs/process-model.md)):

- One thread (`threads=no`, which Godot's web build also offers): with a
  second, `threads@0` holds the memory at its maximum.
- No renderer: Godot has the Compatibility renderer on OpenGL and the
  others on a RenderingDevice (Vulkan, Direct3D 12, Metal). With neither,
  the rendering method is `dummy`, and `--headless` takes the dummy display
  and audio drivers.
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
package into `default` and runs a project whose script computes, emits a
signal, adds a node, sleeps, waits on a timer, writes and reads JSON under
`user://` and quits with a status of its choosing, in Chromium (2.6 s) and
Firefox (3.4 s).
