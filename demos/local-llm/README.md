# Local models

Upstream llama.cpp runs as an ordinary wasm64 process over the core `gpu@0`
interface, serving Qwen models to Pi with no browser model loader, local server
or remote fallback.

## Images

- `pi-local`: Pi with bundled Qwen3.5-0.8B. Requires WebGPU with shader-f16.
- `llama-build`: llama.cpp libraries built for the GPU interface.
- `local-llm-build`: The dolly-llama command built from those libraries.

Open `/pi-local/` (or Dollyfile Studio) and pick a model with Pi's `/model`. The
first prompt loads it; `/local-unload` frees it. Build with
`npm run image -- pi-local`.

| Model | Q4_K_M weights | Context / output |
| --- | ---: | ---: |
| Qwen3.5-0.8B (bundled) | 580 MB | 8,192 / 2,048 tokens |
| Qwen3.5-2B | 1.40 GB | 8,192 / 2,048 tokens |
| Qwen3.5-4B | 3.01 GB | 8,192 / 2,048 tokens |

Optional models download through the HTTP broker in verified 32 MiB ranges into
volatile `/run/dolly-llm`, so they are gone after a reload. Pins:
[`models.json`](models.json).

## Key files

- [`Dollyfile-llama-build`](Dollyfile-llama-build): unchanged llama.cpp and WGSL,
  built in Dolly with CMake.
- [`webgpu.cpp`](webgpu.cpp), [`main.cpp`](main.cpp): the WebGPU C adapter for
  the functions this backend uses, and the `dolly-llama` command.
- [`local-model-provider.js`](local-model-provider.js), [`client.mjs`](client.mjs):
  Pi's provider; it talks to `dolly-llama` over pipes, one JSON request per line.
- [`prepare-local-llm.sh`](prepare-local-llm.sh) only fetches sources and Dawn
  headers; [`test/local-llm-browser.mjs`](test/local-llm-browser.mjs) is an opt-in
  real-model check.

## Limits

- Needs HTTPS or localhost and an adapter with `shader-f16`; there is no CPU-only
  path. Chrome on some NVIDIA Linux setups hides f16 without
  `--enable-dawn-features=vulkan_enable_f16_on_nvidia`.
- Weight sizes are not total memory: each tab holds weights in WasmFS, the
  process and the GPU.
- Small models can call tools but are not dependable coding agents. Thinking and
  image input are off.
