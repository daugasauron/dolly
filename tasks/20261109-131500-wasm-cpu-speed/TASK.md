# Programs' CPU speed: LTO in Dolly's driver, and malloc

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: compiler,libc,performance,godot

## State (2026-11-10)

Both levers measured. Threaded programs link mimalloc in place of dlmalloc; LTO measured and left
out. The seed compiler is rebuilt for it (`6a4dd5dc`); the Godot chain is built and tested on it
(GPU, Godot, threads, process memory, display, terminal, touch). Left: the catalog round on that
seed, with the fixed-point check of `llvm-cc` (`docs/sources.md`).

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

- LTO: Godot's production builds link with LTO; Dolly's driver refuses `-flto` ("Dolly links no
  LTO bitcode", `src/compiler.cpp`). It would take ThinLTO in the driver's compile and link steps,
  then a seed round (`docs/sources.md`, "The seed's compiler").
- malloc: the process libc links Emscripten's `libdlmalloc-mt`
  (`scripts/prepare-process-sysroot.sh`); Emscripten also builds mimalloc.
- Not these: the editor built with `optimize=speed ccflags=-msimd128` (`-O3`, SIMD) against
  Godot's `-O2` measured the same, alternating runs in both browsers (Chrome 25 to 29, 21 to 25,
  57 to 61, 41 to 46 ms; Firefox 33 to 38, 27 to 31, 69 to 78, 52 to 58 ms). Without Liftoff
  (`--no-liftoff`) only the first click is slower: V8 has the code optimized by the second.

Done when each lever is measured on this benchmark and the one that pays is in, or both are
recorded as not paying.

## Measured (2026-11-10)

The old seed (`work/godot-serve`, 2b4a8995a) against the new, alternating runs, the plugin's warm
rounds (ms):

| | Box | Camera | Label | Sun |
| --- | --- | --- | --- | --- |
| Chrome, old seed | 25-29 | 21-28 | 57-60 | 40-46 |
| Chrome, mimalloc | 25-28 | 21-23 | 60-63 | 39-43 |
| Chrome, mimalloc and ThinLTO | 24-25 | 19-21 | 56-62 | 37-42 |
| Firefox, old seed | 32-36 | 27-31 | 69-73 | 52-57 |
| Firefox, mimalloc | 31-36 | 26-31 | 72-77 | 50-54 |
| Firefox, mimalloc and ThinLTO | 31-34 | 26-29 | 70-77 | 50-54 |

- mimalloc (`-lmimalloc-mt` for `-pthread` links): the editor is no faster; its main thread
  allocates without contention. A churn of 2M mixed small blocks: a threaded program 47 to 20 ms
  in Chrome, 56-59 to 18-19 in Firefox; four threads at once 1870 to 56 ms and 2070 to 25
  (dlmalloc locks one heap). Single-threaded programs keep dlmalloc: 47 and 125 ms on both seeds.
  A threaded heap reserves 16 MiB at its first allocation (the memory takes its maximum when a
  second thread starts anyway, `src/process-worker.mjs`).
- ThinLTO (the driver's `-flto=thin`: bitcode objects whose code lld generates): the Inspector 4
  to 8% faster in Chrome, about 4% in Firefox; the editor's `--import` 8% faster in Firefox, its
  start 60 ms slower there (704 against 650 ms); the editor 218 MB against 199; its image built in
  1647 to 1769 s against 830 to 985, since Dolly's lld generates every module's code in the link,
  on one thread, where the compiles ran four at once. Not worth it: the driver refuses `-flto`
  again. A threaded lld (`--thinlto-jobs`) would not serialize that codegen.
- Not Dolly's: memory64 bounds checks. Chrome 156 already guards memory64 with its trap handler,
  whatever the memory's maximum (4096 to 262144 pages, shared or not): a load/store loop takes 132
  ms (134 to 143 with `--no-wasm-memory64-trap-handling`) where memory32 takes 113. The editor with
  no bounds checks at all (`--no-wasm-bounds-checks`, measurement only): Box 20-22, Camera 17-18,
  Label 47-51, Sun 32-37 against 24-26, 20-22, 56-60, 37-39; its import 2630 against 3140 ms.
  Of the gap to native, memory64's checks are about 15%.

## Closed (2026-11-16, the audit)

The done-when holds: both levers are measured above, and the one that pays is in. Threaded programs
link mimalloc (`88297891a`, `programs/compiler.cpp:934`), in v0.1.6 and v0.1.7. ThinLTO is recorded
as not paying, and the driver still refuses `-flto` (`programs/compiler.cpp:387`). The State's "left:
the catalog round on that seed" was done by 0.1.6's and 0.1.7's full rounds. 0.1.7's seed compiler
`c98f9ab6…` is the fixed point (`9c589654e`). Accepting `-flto` for upstream builds that ask for it
is `tasks/20261104-124135-cc-flto`, which now quotes the measured cost above.
