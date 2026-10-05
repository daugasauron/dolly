# WebGPU on any GPU: discrete adapters, optional shader-f16, model-size packages

- STATUS: CLOSED
- PRIORITY: 290
- TAGS: gpu,local-llm,packages,demo

Owner (2026-10-05): "currently firefox 'works' because it uses the integrated
gpu, not my nvidia one. I want the nvidia one to work, but it complains again
on the f18 something something. The WebGPU setup should be adaptable for anyone
that has a GPU, and packages should let them try different model sizes. Verify
this with playwright." ("f18" is presumably `shader-f16`.)

This machine: NVIDIA RTX 5070 (12 GB, driver 580.178.04) and an AMD integrated
GPU (`1002:13c0`).

## Work

1. Reproduce with Playwright in Chrome and Firefox, each forced onto each
   adapter. Record the adapter, its features and limits, and the exact error.
2. Adapter choice belongs to the `gpu@0` provider: decide the power preference,
   show the chosen adapter in the GPU indicator, and update
   `docs/browser-boundary.md`.
3. Negotiate instead of requiring: no optional feature or raised limit is
   assumed. The inference path picks f16 or f32 from what the adapter grants
   and says which; a missing requirement fails with a line naming it.
4. Model sizes as packages a user installs with `amy`, including sizes above
   the 2 GiB image limit (Qwen3.5-4B is 3 GB): choose the mechanism and record
   which size fits which amount of GPU memory.

## Done when

- A Playwright matrix {Chrome, Firefox} x {NVIDIA, integrated, no GPU} is
  recorded here with tokens per second per model size.
- The local model runs on the NVIDIA adapter in both browsers, or the browser
  defect is identified with its upstream reference.
- At least three model sizes install with `amy`.

## Reproduction (2026-10-05, before changes)

Chrome 151.0.7922.71 (`channel: "chrome"`), Firefox 156.0.1 (the system snap,
driven by Playwright 1.63 with `channel: "moz-firefox"` over WebDriver BiDi;
the snap needs `TMPDIR` under `$HOME` for its profile and upload files),
headed under a private `Xvfb :125`. Adapters per `powerPreference`, identified
by vendor where the browser names it and otherwise by NVIDIA memory growth
while holding a 768 MiB device allocation:

| Browser | default | `high-performance` | `low-power` |
| --- | --- | --- | --- |
| Chrome | NVIDIA `blackwell`, no `shader-f16` | same | AMD `rdna-2`, `shader-f16` |
| Firefox | AMD (unnamed), `shader-f16` | NVIDIA (unnamed), `shader-f16` | AMD |

The same holds in a dedicated Worker (where the GPU provider runs). NVIDIA
limits: 49,152 B workgroup storage, 4 GiB max buffer in Chrome, 2 GiB in
Firefox; subgroups only in Chrome. Firefox names no adapter (empty vendor,
architecture, description).

- **"Complains about f16"** is Chrome on NVIDIA: `pi-local` boots with
  `GPU: nvidia blackwell`, then `dolly-llama --check` prints
  `{"error":"Local inference requires a WebGPU adapter with shader-f16 support"}`.
  Upstream cause: Dawn exposes `shader-f16` on NVIDIA Vulkan only from driver
  615.71 (`PhysicalDeviceVk.cpp`, crbug.com/42251215, toggle
  `vulkan_enable_f16_on_nvidia`); this machine has 580. llama.cpp's WebGPU
  backend (pinned 093a2f86 and current master) requires `ShaderF16`, with no
  other path.
- **Firefox already runs on NVIDIA**: the provider asks for
  `high-performance`, which is NVIDIA here; only a preference-less request
  gets the integrated GPU. It is slow on both: Qwen3.5-2B 0.52 tokens/s on
  NVIDIA, 0.5 on AMD (Chrome with the f16 flag: 52-67). Cause, measured: Firefox
  settles every `onSubmittedWorkDone` and `mapAsync` on a 100 ms timer
  (median 100 ms against Chrome's 0.1 ms; Mozilla bug 1870699, "Don't poll
  WebGPU from a timer", ASSIGNED), and a token waited about 16 times. Error
  scopes are not affected (0-2 ms).

Forcing adapters (what actually works):

| Adapter | Chrome | Firefox |
| --- | --- | --- |
| NVIDIA | default (`--enable-unsafe-webgpu --use-angle=vulkan --enable-features=Vulkan`) | default with `dom.webgpu.enabled`, or `MESA_VK_DEVICE_SELECT='10de:2f04!'` |
| AMD integrated | add `--use-webgpu-power-preference=force-low-power` | `MESA_VK_DEVICE_SELECT='1002:13c0!'` |
| Software | `--use-webgpu-adapter=swiftshader` (no `shader-f16`) | `MESA_VK_DEVICE_SELECT='10005:0!'` (lavapipe, has `shader-f16`) |
| No WebGPU | omit `--enable-unsafe-webgpu` | `dom.webgpu.enabled` false (the default) |

`MESA_VK_DEVICE_SELECT`, `DRI_PRIME` and `__NV_PRIME_RENDER_OFFLOAD` do not
change Chrome's choice; `DRI_PRIME=1` makes NVIDIA Firefox's default.

## Decisions

- **Adapter rule**: keep one `high-performance` request in the page check and
  the GPU Worker. It gets the discrete GPU in both browsers; the page has no
  other selector without new authority. The indicator now also says whether
  the adapter has `shader-f16`. Firefox hides the name, so it shows
  `unnamed WebGPU adapter`.
- **f16 negotiation in the program, not the provider**: `webgpu.cpp` (the
  in-image WebGPU C adapter) runs llama's unchanged WGSL as is when the device
  has `shader-f16`, and otherwise widens it: `f16` types, `vecNh`, `h`
  literals and `bitcast<vec2<f16>>` become f32 forms, and the reported
  workgroup storage is halved so llama sizes its tiles for f32. Buffers keep
  their bytes, so a shader that stores f16 in a buffer (or in a struct, as the
  q8_1 dot-product path does) fails naming `shader-f16`; the adapter therefore
  reports no packed dot product while widening, and `dolly-llama` keeps the KV
  cache in f32 and Flash Attention off (its mask is f16). The weights of all
  three models have no F16 tensors. `--check` and the ready line report
  `"shaders":"f16"|"f32"`; Pi's status says `GPU, f16 shaders` or `GPU, f32
  shaders`; an engine failure shows the engine's `Dolly WebGPU:` line. No
  browser flag is needed.
- **Firefox latency**: the adapter waits only when a submission is pending
  since the last wait (ggml synchronized after each of six input writes per
  token), and a compute scope may queue 64 submissions before a batch waits
  (surfaces keep 3 for frame pacing).
- **Small model name**: `qwen3.5-0.8b` is not a valid image name
  (`validName`), so the package is `qwen3.5-800m`.

## Matrix after the changes (2026-10-06)

Engine `09a82cc0`, provider `5a4ff7d4`, Chrome 151.0.7922.71 and Firefox
156.0.1 headed under `Xvfb :125`, adapters forced as above. Each cell: the GPU
indicator, the shaders `dolly-llama` chose, tokens/s of two greedy generations
(128 tokens in Chrome, 16-64 in Firefox), and the browser's peak NVIDIA memory.
The machine is shared: at load average 14-29 Chrome's NVIDIA numbers fell to
21-50 tokens/s for the 2B, so the quiet runs (load 4-6) are the reference.

| Browser | Adapter | Indicator | Model | Shaders | Tokens/s | NVIDIA MiB |
| --- | --- | --- | --- | --- | --- | ---: |
| Chrome | NVIDIA | `GPU: nvidia blackwell · no shader-f16` | Qwen3.5-0.8B (amy) | f32 | 24.6, 22.8 | 1,495 |
| Chrome | NVIDIA | same | Qwen3.5-2B | f32 | 77.8, 83.8 | 2,237 |
| Chrome | NVIDIA + `vulkan_enable_f16_on_nvidia` | `... · shader-f16` | Qwen3.5-2B | f16 | 78.8, 80.8 | 2,045 |
| Chrome | NVIDIA | `... · no shader-f16` | MiniCPM5-2B (amy) | f32 | 65.9, 67.6 | 3,328 |
| Chrome | NVIDIA | same | Qwen3.5-4B (download) | f32 | fails: `Dolly WebGPU: out of GPU memory (the device's, or gpu@0's 4 GiB)` | 2,807 |
| Chrome | NVIDIA + `vulkan_enable_f16_on_nvidia` | `... · shader-f16` | Qwen3.5-4B | f16 | 50.4, 52.7 | 3,879 |
| Chrome | AMD (`force-low-power`) | `GPU: amd rdna-2 · shader-f16` | Qwen3.5-0.8B | f16 | 6.6, 6.7 | - |
| Chrome | AMD | same | Qwen3.5-2B | f16 | 5.3, 5.4 | - |
| Chrome | SwiftShader | `CPU (software GPU): google swiftshader · no shader-f16` | Qwen3.5-0.8B | f32 | 0.05, then device lost | - |
| Chrome | none | `No GPU: the browser did not provide a GPU adapter` | - | boot stops: `Required host module gpu@0 is unavailable: the browser did not provide a GPU adapter` | | |
| Firefox | NVIDIA | `GPU: unnamed WebGPU adapter · shader-f16` | Qwen3.5-0.8B (amy) | f16 | 5.0, 4.8 | 1,344 |
| Firefox | NVIDIA | same | Qwen3.5-2B | f16 | 4.9, 4.7 | 2,296 |
| Firefox | NVIDIA | same | Qwen3.5-4B (download) | f16 | 5.0, 5.0 | 5,218 |
| Firefox | AMD (`MESA_VK_DEVICE_SELECT`) | `GPU: unnamed WebGPU adapter · shader-f16` | Qwen3.5-2B | f16 | 2.5, 2.5 | - |
| Firefox | lavapipe | `CPU (software GPU): unnamed WebGPU adapter · shader-f16` | Qwen3.5-0.8B | f16 | 0.6, 0.6 | - |
| Firefox | none | `No GPU: WebGPU is unavailable in this browser` | - | boot stops: `Required host module gpu@0 is unavailable: WebGPU is unavailable in this browser` | | |

Before the changes the same Firefox NVIDIA 2B run gave 0.52 tokens/s and
Chrome NVIDIA refused. Greedy output is the same text on f16 (Firefox) and
f32 (Chrome) shaders ("The sea is a vast, living entity that constantly
shifts between the depths of mystery and the surface of chaos..."). Firefox is
now bound by its timer: a token waits twice (compute, then the logits map),
about 200 ms, whatever the model. The 0.8B decodes slower than the 2B in Chrome
(40 against 12 ms a token) although it is faster on the AMD GPU; not
investigated. SwiftShader runs a token in 21 s and Chrome then loses the
device; it is a software adapter, labelled as one.

`amy install` in `pi-local` takes 9-14 s for the 0.8B and 23 s for MiniCPM5;
afterwards a session save fails with `Dolly session exceeds its 512 MiB
limit; remove files or installed packages and save again`. The on-demand 4B
download failed before (`Browser HTTP broker could not connect`: curl did not
ask the broker to follow Hugging Face's redirect); with `-L` it downloads and
verifies in 5-6 minutes here.

Which size fits which GPU memory (peak NVIDIA memory of the tab, full 16k
context): 0.8B 1.5 GB, 2B 2.3 GB (2.1 with f16), MiniCPM5 3.4 GB, 4B 3.9 GB
with f16. The 4B's f32 KV cache (1 GiB at 16k) puts it over the 4 GiB
`gpu@0` grants, so it needs `shader-f16`: Firefox, an AMD or Intel GPU, or
Chrome on NVIDIA with driver 615.71 or later. `gpu@0`'s 4 GiB quota is kept:
it is the core's availability bound, not a demo's to widen.

## Model sizes above 2 GiB (design, not implemented)

`MAX_SNAPSHOT_BYTES` (`src/snapshot-records.mjs`) caps every image, package
and imported image at 2 GiB, so Qwen3.5-4B Q4_K_M (3.01 GB) cannot be a
package; of its upstream quantizations only IQ2_M (1.95 GB) fits, at a
quality cost that defeats the reason to use 4B. Today Pi downloads it on first
use from the pinned upstream URL through the HTTP broker, verified by SHA-256,
into volatile `/run/dolly-llm`: no core change, but a 3 GB download per tab
session (the browser's HTTP cache may keep it) and no offline use.

A package for it needs one core change, either:

1. **Part packages**: the release splits the GGUF into byte ranges below
   2 GiB, each a package (`qwen3.5-4b.0`, `qwen3.5-4b.1`) installing
   `/usr/share/dolly/llm/qwen3.5-4b.gguf.N`; the provider concatenates them
   into `/run` and checks the upstream SHA-256. Core change: `amy` and the
   package index learn that one name installs an ordered set of packages
   (or a package may name packages it requires). The session then holds the
   parts and the joined file (6 GB) unless the join streams and deletes.
2. **Lazy sources**: a package may carry a pinned `SOURCE` that is fetched on
   first read instead of at build, so the image stays small and the bytes
   come from the release's static files. Core change: a new restore record
   kind and a fetch path in the kernel or packages service.

Recommendation: keep the verified download until the owner wants offline
4B; then part packages, which keep every image under the cap and add no
lazy I/O path to the kernel.

## Verification (2026-10-06)

- `DISPLAY=:125 node demos/local-llm/test/local-llm-browser.mjs` (now Chrome
  without the Dawn f16 flag, so f32 shaders on NVIDIA, and the installed
  Firefox 156 on NVIDIA with f16): bundled inference, reuse, cancellation,
  session restore and fresh boot passed in both, external requests denied.
- `amy install` verified for three sizes: `qwen3.5-800m` and `minicpm5-2b` in
  `pi-local` (Chrome and Firefox), `qwen3.5-2b` in `default` (SHA-256 of the
  installed GGUF matches upstream).
- `DISPLAY=:125 node test/gpu-indicator-browser.mjs chromium firefox hardware`,
  `DISPLAY=:125 node test/gpu-render-browser.mjs chromium [uncompressed]`
  (the submission proof now checks the compute scope's 64),
  `node test/core-browser.mjs chromium firefox`, `npm run test:source`
  (332 tests) and `npm run lint:dollyfiles` pass. `npm run test:demos --
  local-llm` skips without a display, as before.
- Images rebuilt here: `local-llm-build`, `pi-local`, `qwen3.5-800m`; recipe
  pins are left to the integrator.

Closed: the model runs on the NVIDIA adapter in both browsers (Chrome through
f32 shaders, Firefox with f16, which was already on NVIDIA), the matrix is
recorded above, and three sizes install with `amy`. Left as recorded: Firefox's
timer (bug 1870699), Dawn's NVIDIA f16 gate (crbug.com/42251215), and a
package for models above 2 GiB, which needs one of the core changes above.
