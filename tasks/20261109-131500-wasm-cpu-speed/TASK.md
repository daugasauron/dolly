# Programs' CPU speed: LTO in Dolly's driver, and malloc

- STATUS: OPEN
- PRIORITY: 250
- TAGS: compiler,libc,performance,godot

## State (2026-11-09)

Measured, nothing changed. Godot's editor does its work at about half native speed in Dolly; two
levers are in the toolchain, and each changes the seed compiler or the process libc, so the
runtime and the whole catalog.

## Evidence

The owner asked for a snappy editor (`tasks/20261108-040718-godot-gpu`, "The editor's input
latency"). After input, the slowest common click is selecting a node: Godot rebuilds the
Inspector in one frame. `EditorInterface.edit_node` timed by an editor plugin, headless, a scene
with a box, a camera, a light and a label (warm, ms):

| | Box | Camera | Label | Sun |
| --- | --- | --- | --- | --- |
| Godot 4.7.2's Linux build (native, LTO) | 13-15 | 11-13 | 27-32 | 22-28 |
| Dolly, Chrome | 26-27 | 23-25 | 58-60 | 42-43 |
| Dolly, Firefox | 32-34 | 27-29 | 70-72 | 53-56 |

On the page, with the GPU, the Inspector shows 56 to 142 ms after the click in Chrome. A Chrome
trace (V8 sampling) of those frames: Godot's object model throughout (themes, text shaping,
signals), no kernel calls; `emscripten_builtin_malloc` and `free` are 16% of the self time.
Turning off Liftoff changes nothing after the first click.

- LTO: Godot's production builds link with LTO; Dolly's driver refuses `-flto` ("Dolly links no
  LTO bitcode", `src/compiler.cpp`). It would take ThinLTO in the driver's compile and link steps,
  then a seed round (`docs/sources.md`, "The seed's compiler").
- malloc: the process libc links Emscripten's `libdlmalloc-mt`
  (`scripts/prepare-process-sysroot.sh`); Emscripten also builds mimalloc.

Done when each lever is measured on this benchmark and the one that pays is in, or both are
recorded as not paying.
