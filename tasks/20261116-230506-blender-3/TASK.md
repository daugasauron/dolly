# Blender in Dolly, stage 3: a Cycles render on the CPU

- STATUS: OPEN
- PRIORITY: 140
- TAGS: blender,port,demo

Research and the whole plan: `work/research/blender-2026-11-17.md`. Stage 1 is
[20261116-230501-blender-1](../20261116-230501-blender-1/TASK.md).

## State (2026-11-17)

It renders. Stage 1's package has Cycles, its recipe renders the default scene while it builds,
and `demos/blender/test/blender-browser.mjs` renders it to a PNG and reads the frame back, in
Chromium and Firefox. Measured in a session (Chrome, a machine at load 40): 1920 by 1080 at 64
samples in 14.4 s on four threads and 50.7 s on one; 480 by 270 at 16 samples in 1.0 s
(`build/blender-evidence/default-cube-480x270-16spp.png`). Two upstream sources broke on
Dolly's libc++ on the way (Cycles' `StackAllocator`, OpenImageIO's `ustring`); both are patched
(`demos/blender/README.md`). Left:

- Blender's own Linux build (5.3.0, AVX2 kernel and Embree) renders the same frame in 8.8 s on
  four threads and 32.0 s on one, at load 10 (2026-11-17): Dolly's 14.4 s and 50.7 s were at
  load 40, so the ratio of about 1.6 is an upper bound to measure again side by side; the pixel
  comparison is not done;
- a scene that is more than a cube (textures, many objects), to find what else of this kind
  waits in paths the default scene does not run;
- the thread count: Cycles takes four (`nproc`), a process may have 32.

## What

`blender -b -E CYCLES -o //frame -f 1` on the default scene writes a PNG, in a browser on Dolly.

- Cycles' kernel is the scalar one: its SSE kernels are for x86-64 and, through sse2neon, ARM
  (`intern/cycles/util/optimization.h`); Dolly claims neither.
- BVH2, Cycles' own: Embree knows x86 and ARM only. No OSL (needs a JIT), no denoiser (OIDN), no
  path guiding, no volumes (OpenVDB): each off by upstream's option, each a later decision.
- Threads through oneTBB on `threads@0`, at most 32 a process; the render at 1 and at 4 threads.
- Times against Blender's own Linux build of the same scene and sample count, as the Godot
  port's README has for GDScript.
- The frame compared with the native build's (same seed, same samples): how many pixels differ.
- A test in `demos/blender/test/`: a small render (64 samples, 320 by 180) whose PNG's size and
  a few pixels are checked.

## Size and risks

1 day after stage 1. Risks: the scalar kernel in WebAssembly is slow (expect several times a
native scalar build); TBB's workers on a platform it does not know; the image writer
(OpenImageIO's PNG) and colour management (OpenColorIO's configuration files in the package).

## Done when

The test renders the default scene to a PNG in Chromium and Firefox, and the README has the
times.
