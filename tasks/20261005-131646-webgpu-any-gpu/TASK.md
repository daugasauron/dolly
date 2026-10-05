# WebGPU on any GPU: discrete adapters, optional shader-f16, model-size packages

- STATUS: OPEN
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
