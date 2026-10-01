# Make GPU use and CPU fallbacks obvious

- STATUS: OPEN
- PRIORITY: 290
- TAGS: gpu,display,ux,demo

Owner request (2026-10-01): "everything that uses GPU should be obvious. The
user should always know if GPU is used or if there's some CPU fallback in
place."

## Measured (2026-10-01, Linux, NVIDIA Blackwell)

| Browser | Default | Enabled |
| --- | --- | --- |
| Chrome 151 | no adapter | hardware adapter with `--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=vulkan` (each alone, or the first two, gave none) |
| Firefox 156 (snap) | no `navigator.gpu` | hardware adapter with `dom.webgpu.enabled` |
| Playwright Firefox 155 | no `navigator.gpu` | `requestAdapter()` returns null |

Enable steps are in [`docs/gpu.md`](../../docs/gpu.md#enabling-webgpu).

## Where the user cannot tell today

- `host/gpu/worker.mjs` knows the adapter and `isFallbackAdapter` and posts them
  in its status, but a software adapter (SwiftShader, llvmpipe) runs without any
  visible sign; the 0 A.D. tests use one deliberately.
- With no adapter, `gpu@0` programs fail with `ENOSYS`; the page does not say
  why or how to enable WebGPU.
- SDL2 games (ClassiCube, bhop, rts-arena) and Slopyard's raylib path render on
  the CPU into the framebuffer; the start page and image pages do not say so.
- Local LLM inference: check whether any CPU path exists.

## Done when

- The trusted page shows a persistent indicator while `gpu@0` is in use:
  hardware adapter (name where the browser gives one), software adapter, or
  WebGPU unavailable with the reason and a link to the enable steps. The guest
  cannot draw or suppress it.
- Every image that renders or computes says which it uses (GPU, software GPU
  adapter, CPU) on its start-page entry and page, derived from its explicit
  `REQUIRES HOST gpu@0` (Dollyfile 6) and the demo's renderer, not guessed
  from names.
- No silent fallback remains: each CPU or software path is either labelled or
  fails explicitly. Browser tests check the indicator for hardware, software
  and missing adapters.
