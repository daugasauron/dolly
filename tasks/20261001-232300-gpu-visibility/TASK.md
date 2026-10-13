# GPU or CPU: the start page and the image pages do not say which a demo uses

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: gpu,display,ux,demo

## Closed (2026-10-13, `46a6cb94` and `8a7561d8`)

Owner (2026-10-01): "everything that uses GPU should be obvious. The user should always know if
GPU is used or if there's some CPU fallback in place."

What says it now, each derived from the image's `REQUIRES HOST` lines and nothing else: a
program reaches a GPU only through `gpu@0`, so an image that does not declare it draws and
computes everything on the CPU, whatever its renderer.

- **The start page**: every row has a "Uses" cell, `GPU` for an image that declares `gpu@0` and
  `CPU` for every other image that opens (`graphics` in `scripts/image-menu.mjs`); a row that
  cannot be opened and declares no `gpu@0` says nothing. The cell's title says what the word
  means. So ClassiCube, Airtime, RTS Arena, Xonotic and Wine say `CPU`, as do the shells.
- **An image's page with `gpu@0`**: the `#gpu-status` indicator shipped on 2026-10-01 names the
  adapter (`GPU: …`), a software adapter (`CPU (software GPU): …`) or why there is none, with
  the link to the enable steps ("Page indicator", below). Since `7ecc1466` the corner indicators
  hide after ten seconds and return on Ctrl+Shift+F (the owner's decision,
  `20261006-105730-corner-indicators`); the start page's shortcuts name the chord now.
- **An image's page without `gpu@0`**: the same indicator says `CPU: this image has no GPU
  module` (`indicateNoGpu` in `src/page-indicators.mjs`, `data-gpu="absent"`). Before, such a
  page said nothing.
- **Firefox** (from `20261005-225813-firefox-adapter`): it hides every adapter's name, and the
  indicator says what it can know, `GPU: unnamed WebGPU adapter`. Whether a second, unused
  adapter exists a page cannot learn: WebGPU answers one request with one adapter.
  `docs/gpu.md` ("Enabling WebGPU") says which adapter each browser gives, measured, and the
  flags and the Mesa variable that force another.

Tests, 2026-10-13, Chrome 151 and Firefox 155: `test/site-browser.mjs` (every row's label
against the registry's host modules; `default`'s page has the indicator in the state `absent`),
`test/indicators-browser.mjs` (the indicator is shown on `system`'s page and leaves with the
others) and `test/gpu-indicator-browser.mjs` (software adapter, a Worker without an adapter, no
WebGPU). Its `hardware` case needs a GPU window and was last run on 2026-10-01.

Known and not changed: inside a GPU image the guest is told only `WebGPU`, never the adapter (a
fingerprinting choice of `host/gpu/worker.mjs`), so the local-LLM status line says `GPU` on a
software adapter too, and llama.cpp runs some operations on the CPU ("Demo audit"); the page's
indicator is the authority. `docs/gpu.md` does not yet name the `absent` state: that sentence
is on `core/site-polish-help`, because the document is an image input.

## Measured (2026-10-01, Linux, NVIDIA Blackwell)

| Browser | Default | Enabled |
| --- | --- | --- |
| Chrome 151 | no adapter | hardware adapter with `--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=vulkan` (each alone, or the first two, gave none) |
| Firefox 156 (snap) | no `navigator.gpu` | hardware adapter with `dom.webgpu.enabled` |
| Playwright Firefox 155 | no `navigator.gpu` | `requestAdapter()` returns null |

Enable steps are in [`docs/gpu.md`](../../docs/gpu.md#enabling-webgpu).

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
