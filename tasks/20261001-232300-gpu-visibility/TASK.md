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

## Page indicator (2026-10-01, branch `work/gpu-visibility`)

Whenever `gpu@0` is enabled, [`host/gpu/gpu.mjs`](../../host/gpu/gpu.mjs) shows
`#gpu-status` (bottom right, above Save), page DOM over the display that guest
frames cannot draw, cover or remove. `data-gpu` is the state:

- `hardware`: `GPU: <vendor architecture description>`, from the page's adapter
  check, then from each device the GPU Worker creates.
- `software`: `CPU (software GPU): ...` for `isFallbackAdapter`, SwiftShader or
  llvmpipe.
- `unavailable`: `No GPU: <reason>` and a link to
  `docs/gpu.md#enabling-webgpu`. The page check shows it before the image's
  required `gpu@0` stops boot before ENTRY; the GPU Worker shows it when it
  cannot create a device (`OPEN` then fails with `ENODEV`, or `ENOSYS` without
  `navigator.gpu`).

The Worker now reports the adapter once per device, not only with frames, so
compute-only programs (local LLM) report it too. No trusted code has a CPU
fallback: the display compositor is the explicit `display@0` 2D canvas, and the
GPU Worker never forces a fallback adapter.

Measured with `test/gpu-indicator-browser.mjs` (Chrome 151.0.7922.71, Playwright
Firefox 155): headless Chrome `--disable-gpu --enable-unsafe-webgpu` (the core
tests' launch) gets `google swiftshader` with `isFallbackAdapter: true`; headless
Chrome with the 0 A.D. SwiftShader flags, or with no flags, gets no adapter;
headed Chrome under Xvfb with the Vulkan flags gets `nvidia blackwell`;
Playwright Firefox without `dom.webgpu.enabled` has no `navigator.gpu`.

Playwright Firefox 155 with `dom.webgpu.enabled` depends on the X display, not
on cross-origin isolation: under Xvfb `:125` or with no `DISPLAY` it gets no
adapter on a plain or an isolated page; with the desktop display (`:1`,
inherited by mistake in one run) it gets an adapter with empty vendor,
architecture and description and `isFallbackAdapter: false`, `gpu-sdk` boots
and a guest `dolly_gpu_open` succeeds. The indicator then shows
`GPU: unnamed WebGPU adapter`. The test's Firefox case therefore runs Firefox
as it ships (WebGPU off), which does not depend on the display.

Not done: screenshots of the four states (not captured), and the start-page and
image-page labels, which wait for Dollyfile 6.

## Demo audit (no demo changed)

| Image | Renders / computes with | Fallback | Shown today | Label |
| --- | --- | --- | --- | --- |
| classicube | ClassiCube SoftGPU (`demos/classicube/config.h:10`) through SDL2's framebuffer driver | none | build README only | CPU |
| bhop | raylib `GRAPHICS_API_OPENGL_SOFTWARE` + `PLATFORM_MEMORY` (`demos/slopyard/gamedev-sdk.dm:34`) into `display@0` | none | nothing | CPU |
| rts-arena | SDL2 software renderer; SDL2 is built with OpenGL, GLES, Vulkan off (`demos/sdl2/sdl2.dm`) | none | nothing | CPU |
| slopyard | scene in WGSL over `gpu@0`; raylib's software rasterizer draws only the editor UI into a buffer uploaded to the GPU; physics on CPU | none: `perror("WebGPU is required for Slopyard")` (`src/render.c:50`) | `Slopyard GPU: WebGPU` | GPU (UI rasterized on CPU) |
| pi-local, dollyfile-studio | llama.cpp ggml-webgpu, `n_gpu_layers=999`; `libggml-cpu.a` is linked and runs the input embedding, any op WebGPU rejects, and sampling | no whole-model fallback: no f16 GPU device is an error (`demos/local-llm/main.cpp:25`); per-op CPU placement is logged only to `~/.cache/dolly-llm/engine.log`; a failed preflight discards stderr and says `WebGPU preflight failed` (`client.mjs:21,27`) | `ready · GPU`, `tokens/s · GPU`, also on a software adapter | GPU, some ops on CPU |
| gpu-fluid | upstream solver over `gpu@0` | none: `perror` and exit | `GPU adapter: WebGPU` (fixed name) | GPU |
| zero-ad | `rendererbackend=dolly` WebGPU device, no other backend | none: open failure aborts | in-game `Dolly WebGPU` | GPU |

Each GPU image may run on a software adapter; the page indicator now says so.
Studio inherits `gpu@0` through `FROM pi-local`, so it cannot boot without
WebGPU even for remote models. For the Slopyard and local-LLM owners: the guest
receives the fixed name `WebGPU`, never the adapter (`host/gpu/worker.mjs`, a
fingerprinting choice), so guest-side text cannot tell hardware from software;
the page indicator is the authority.

## Start page and image page labels (after Dollyfile 6)

- Start page: `menuRow` (`scripts/image-menu.mjs:23`) gets the image's
  `hostRequirements` from `scripts/generate-routes.mjs:46` (the graphs at line
  32 already have them) and marks `gpu@0` rows; the hosted rows in
  `scripts/package-github-pages.mjs:14` call it without them today.
- CPU renderers have no host requirement to derive from; their README
  description lines (`- \`image\`: ...`, parsed by `scripts/image-menu.mjs:6`)
  must say `CPU` or software rendering.
- Image page: the run page already shows `#gpu-status` for `gpu@0`. The
  Dollyfile view (`scripts/render-dollyfile-view.mjs:150`, title; body at
  `:163`) has `record.hostRequirements` and can show the same label.
