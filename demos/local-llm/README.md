# Local models

Upstream llama.cpp runs as an ordinary wasm64 process over the core `gpu@0`
interface, serving open models to Pi with no browser model loader, local server
or remote fallback.

## Images

- `pi-local`: Pi with the bundled Qwen3.5-2B. Requires WebGPU with shader-f16.
- `llama-build`: llama.cpp libraries built for the GPU interface.
- `local-llm-build`: The dolly-llama command built from those libraries.
- `qwen35-2b`: Model package: Qwen3.5-2B weights and license.
- `minicpm5-2b`: Model package: MiniCPM5-2B weights and license.

Open `/pi-local/` (or Dollyfile Studio) and pick a model with Pi's `/model`. The
first prompt loads it; `/local-unload` frees it. Build with
`npm run image -- pi-local`.

| Model | Q4_K_M weights | Context / output | Source |
| --- | ---: | ---: | --- |
| Qwen3.5-2B (bundled) | 1.40 GB | 16,384 / 2,048 tokens | package `qwen35-2b` |
| MiniCPM5-2B | 1.56 GB | 16,384 / 2,048 tokens | package `minicpm5-2b`, or download |
| Qwen3.5-4B | 3.01 GB | 16,384 / 2,048 tokens | download |

A model package holds one model's exact upstream GGUF at
`/usr/share/dolly/llm/ID.gguf` and its license, exported as `ID`; an image copies
it in (DOLLY 6: `INSTALL`). Pi uses an installed model directly and downloads
any other catalogued model, verified, into volatile `/run/dolly-llm`, so it is
gone after a reload. Pins and prompt formats: [`models.json`](models.json).

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

- Needs HTTPS or localhost and an adapter with `shader-f16`; there is no CPU-only
  path. Chrome on some NVIDIA Linux setups hides f16 without
  `--enable-dawn-features=vulkan_enable_f16_on_nvidia`.
- Weight sizes are not total memory: each tab holds weights in WasmFS, the
  process and the GPU.
- An image holds at most 2 GiB, so Qwen3.5-4B has no package. Small models can
  call tools but are not dependable coding agents. Thinking and image input are
  off.
