# Local models

Upstream llama.cpp runs as an ordinary wasm64 process over the core `gpu@0`
interface, serving open models to Pi with no browser model loader, local server
or remote fallback.

## Images

- `pi-local`: Pi with the bundled Qwen3.5-2B; `amy install` adds other model sizes. Requires WebGPU.
- `llama-build`: llama.cpp libraries built for the GPU interface.
- `local-llm-build`: The dolly-llama command built from those libraries.
- `qwen3.5-800m`: Model package: Qwen3.5-0.8B weights and license.
- `qwen3.5-2b`: Model package: Qwen3.5-2B weights and license.
- `minicpm5-2b`: Model package: MiniCPM5-2B weights and license.

Open `/pi-local/` (or Dollyfile Studio) and pick a model with Pi's `/model`. The
first prompt loads it; `/local-unload` frees it. `amy install qwen3.5-800m` (or
`minicpm5-2b`) installs another size into the session from the release's
packages; Pi downloads any catalogued model that is not installed, verified,
into volatile `/run/dolly-llm`, so it is gone after a reload. Build with
`npm run image -- pi-local`.

| Model | Package | Q4_K_M weights | GPU memory |
| --- | --- | ---: | ---: |
| Qwen3.5-0.8B | `qwen3.5-800m` | 0.58 GB | 1.5 GB |
| Qwen3.5-2B | `qwen3.5-2b` (bundled) | 1.40 GB | 2.3 GB |
| MiniCPM5-2B (2.6B parameters) | `minicpm5-2b` | 1.56 GB | 3.4 GB |
| Qwen3.5-4B | none: download | 3.01 GB | 3.9 GB, with `shader-f16` only |

GPU memory is Chrome's peak on the NVIDIA card with a full context, measured by
`nvidia-smi`; a model fits a GPU with that much free memory, and an integrated
GPU shares system memory. Without `shader-f16` the KV cache is f32: Qwen3.5-4B's
then exceeds the 4 GiB `gpu@0` grants, and it fails naming GPU memory.

All use 16,384 tokens of context and at most 2,048 output tokens, and sample
as their publishers recommend (`sampling` in [`models.json`](models.json)) with
a fresh seed per request. A small model can still repeat itself: the provider
does not run a third identical tool call after two identical results and tells
the model why; if it insists, the run stops and Pi says so. Qwen3.5-4B is the one that completes most coding tasks; pick
it with `/model` for real work.
Measurements: [the model task](../../tasks/20261001-214000-pi-local-model/TASK.md),
[the adapter matrix](../../tasks/20261005-131646-webgpu-any-gpu/TASK.md) and
[the repetition loop](../../tasks/20261005-215204-pi-local-loop/TASK.md).

A model package holds one model's exact upstream GGUF at
`/usr/share/dolly/llm/ID.gguf` and its license, exported as `ID`; an image
`INSTALL`s it, a session `amy install`s it. An image holds at most 2 GiB, so
Qwen3.5-4B (3.0 GB) has no package. Pins and prompt formats:
[`models.json`](models.json).

## GPU and precision

`dolly-llama` uses the adapter `gpu@0` grants, as the page's GPU indicator
names it. With `shader-f16` it runs llama.cpp's WGSL unchanged; without it
(Chrome on NVIDIA under Linux before driver 615.71, SwiftShader),
[`webgpu.cpp`](webgpu.cpp) widens the f16 shader code to f32 and the KV cache
stays f32, at the same speed on the RTX 5070. Pi's status line says
`GPU, f16 shaders` or `GPU, f32 shaders`; a shader that would need f16 in a
buffer fails naming `shader-f16`. No browser flag is needed beyond enabling
WebGPU ([GPU](../../docs/gpu.md#enabling-webgpu)); optionally, Chrome started
with `--enable-dawn-features=vulkan_enable_f16_on_nvidia` gets f16 on NVIDIA,
which saves memory and fits Qwen3.5-4B.

## Key files

- [`Dollyfile-llama-build`](Dollyfile-llama-build): unchanged llama.cpp and WGSL,
  built in Dolly with CMake.
- [`webgpu.cpp`](webgpu.cpp), [`main.cpp`](main.cpp): the WebGPU C adapter for
  the functions this backend uses, and the `dolly-llama` command. It keeps the
  previous request's matching prompt prefix, so agent turns evaluate only new
  tokens.
- [`local-model-provider.js`](local-model-provider.js), [`client.mjs`](client.mjs):
  Pi's provider; it talks to `dolly-llama` over pipes, one JSON request per line.
  [`qwen.mjs`](qwen.mjs) and [`minicpm.mjs`](minicpm.mjs) render each family's own
  chat template and parse its tool calls.
- [`prepare-local-llm.sh`](prepare-local-llm.sh) only fetches sources and Dawn
  headers; [`test/local-llm-browser.mjs`](test/local-llm-browser.mjs) is an opt-in
  real-model check.

## Limits

- Needs HTTPS or localhost and a WebGPU adapter; there is no CPU-only path.
  Firefox settles each GPU wait on a 100 ms timer
  ([bug 1870699](https://bugzilla.mozilla.org/show_bug.cgi?id=1870699)), and a
  token waits twice, so it generates about 5 tokens/s where Chrome generates
  25-80.
- Weight sizes are not total memory: each tab holds weights in WasmFS, the
  process and the GPU. Installed packages are session files: a session holding
  one is larger than a save allows.
- The 2B models call tools but are not dependable coding agents; 0.8B is for
  trying the pipeline. Thinking and image input are off.
