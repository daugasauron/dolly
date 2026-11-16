# Blender in Dolly, stage 3: a Cycles render on the CPU

- STATUS: OPEN
- PRIORITY: 140
- TAGS: blender,port,demo

Research and the whole plan: `work/research/blender-2026-11-17.md`. Stage 1 is
[20261116-230501-blender-1](../20261116-230501-blender-1/TASK.md).

## State (2026-11-17)

Not started; waits for stage 1's program (built with `WITH_CYCLES=ON`).

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
