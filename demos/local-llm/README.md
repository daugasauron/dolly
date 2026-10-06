# Local models

Upstream llama.cpp runs as an ordinary wasm64 process over the core `gpu@0`
interface, serving open models to Pi with no browser model loader, local server
or remote fallback.

## Images

- `pi-local`: Pi with the bundled Qwen3.5-2B; `/local` installs and switches models. Requires WebGPU.
- `llama-build`: llama.cpp libraries built for the GPU interface.
- `local-llm-build`: The dolly-llama command built from those libraries.
- `qwen3.5-2b`: Model package: Qwen3.5-2B weights, description and license.
- `minicpm5-2b`: Model package: MiniCPM5-2B weights, description and license.
- `qwen3.5-4b-1`: Model package: Qwen3.5-4B, shard 1 of 4, description and license.
- `qwen3.5-4b-2`: Model package: Qwen3.5-4B, shard 2 of 4.
- `qwen3.5-4b-3`: Model package: Qwen3.5-4B, shard 3 of 4.
- `qwen3.5-4b-4`: Model package: Qwen3.5-4B, shard 4 of 4.

Open `/pi-local/` (or Dollyfile Studio) and ask; the first prompt loads the
bundled model. In Pi, `/local` lists every model of the release with the GPU
memory it needs on this adapter and its state, or why this adapter cannot run
it. Choosing one that is not installed runs `amy install` for its packages and
switches to it; choosing an installed one switches; **Parameters** changes
sampling, context size and output limit; **Unload** frees the GPU. `/model` and
`/thinking` are Pi's own: any provider's models, and reasoning on or off. Build
with `npm run image -- pi-local`.

| Model | Packages | Download | GPU memory, f16 / f32 | Task, Chrome / Firefox | Tokens/s, Chrome / Firefox |
| --- | --- | ---: | ---: | ---: | ---: |
| Qwen3.5-2B | `qwen3.5-2b` (bundled) | 1.40 GB | 2.1 / 2.3 GB | 8 of 8 / 4 of 4 | 63 / 5 |
| MiniCPM5-2B (2.6B parameters) | `minicpm5-2b` | 1.56 GB | 2.4 / 3.4 GB | 8 of 8 / 4 of 4 | 61 / 5 |
| Qwen3.5-4B | `qwen3.5-4b-1` to `-4` | 3.01 GB | 3.9 GB / does not fit | 8 of 8 / not run | 49 / 5 |

Q4_K_M weights, 16,384 tokens of context, thinking off, on an NVIDIA RTX 5070.
GPU memory is Chrome's peak in `nvidia-smi` with one model loaded; an
integrated GPU shares system memory. The task: list a directory, write a C
program, compile it, run it and report its output
([measurements](../../tasks/20261005-215557-local-models/TASK.md)). Qwen3.5-4B
needs `shader-f16` (below) and is the one for real work: 44 of 48 coding tasks
against 15 to 23 for the 2B-class models
([comparison](../../tasks/20261001-214000-pi-local-model/TASK.md)).

## A model is a package

A model package installs `/usr/share/dolly/llm/ID.json` beside its weights; the
provider lists that directory and names no model. Adding one is
[`models/ID.json`](models/), a recipe per package and a row in
[`config/upstreams.json`](../../config/upstreams.json). The description holds
what no upstream file knows:

- `source`: the pinned upstream GGUF and the license file shipped with it.
- `packages`, `files`: what `amy install` takes and the weight files with their
  sizes. A model is installed when the files are there. One above the 2 GiB an
  image holds is llama.cpp's own shards ([`build-gguf-split.sh`](build-gguf-split.sh)),
  one package each, loaded from the first.
- `gpu`: GPU memory in GB measured with f16 and with f32 shaders. A kind that
  is missing does not fit the 4 GiB of buffers `gpu@0` grants, and `/local`
  says so instead of loading.
- `pi`: a Pi model definition (Pi's `docs/models.md`), passed through:
  context, output limit, whether it reasons, and the publisher's sampling where
  the GGUF carries none.

Everything else is the GGUF's, read by llama.cpp's own code in `dolly-llama`:
the chat template and its special tokens, the tool-call syntax, grammar and
parser, stop tokens, the thinking switch and `general.sampling.*` defaults.

A user's changes are Pi's files: `/model` and `/thinking` save their choice in
`~/.pi/agent/settings.json`, and `/local` writes `modelOverrides` for provider
`webgpu` in `~/.pi/agent/models.json` (`samplingParams`: `temperature`, `top_p`,
`top_k`, `min_p`, `repeat_penalty`, `presence_penalty`, `frequency_penalty`,
`seed`; `contextWindow`; `maxTokens`). Each request draws a fresh seed unless
`seed` pins one, and a changed `contextWindow` reloads the model at the next
prompt. Nothing is stored per machine: `dolly-llama --check` prints the shader
kind each time.

## GPU and precision

`dolly-llama` uses the adapter `gpu@0` grants, as the page's GPU indicator
names it. With `shader-f16` it runs llama.cpp's WGSL unchanged; without it
(Chrome on NVIDIA under Linux before driver 615.71, SwiftShader),
[`webgpu.cpp`](webgpu.cpp) widens the f16 shader code to f32 and the KV cache
stays f32, at the same speed on the RTX 5070. A shader that would need f16 in
a buffer fails naming `shader-f16`. No browser flag is needed beyond enabling
WebGPU ([GPU](../../docs/gpu.md#enabling-webgpu)); optionally, Chrome started
with `--enable-dawn-features=vulkan_enable_f16_on_nvidia` gets f16 on NVIDIA,
which saves memory and fits Qwen3.5-4B.

## Key files

- [`Dollyfile-llama-build`](Dollyfile-llama-build), [`CMakeLists.txt`](CMakeLists.txt):
  unchanged llama.cpp, its WGSL and the chat and sampling sources of its
  `common` library, built in Dolly with CMake.
- [`webgpu.cpp`](webgpu.cpp), [`main.cpp`](main.cpp): the WebGPU C adapter for
  the functions this backend uses, and the `dolly-llama` command. Each stdin
  line is the request `llama-server` takes at `/v1/chat/completions`; stdout is
  the event stream it would answer with. A field it does not implement is an
  error naming it. It keeps the previous request's matching prompt prefix, so
  agent turns evaluate only new tokens, and logs each request's token counts
  and times to `~/.cache/dolly-llm/engine.log`.
- [`local-model-provider.js`](local-model-provider.js), [`client.mjs`](client.mjs),
  [`model.mjs`](model.mjs): the Pi extension. Pi's own OpenAI chat-completions
  adapter talks to the engine through a `fetch` bound to its pipes; the
  extension adds `/local`. A small model can repeat itself: a third identical
  tool call after two identical results is not run and the model reads why;
  if it insists, the run stops and Pi says so
  ([the loop](../../tasks/20261005-215204-pi-local-loop/TASK.md)).
- [`prepare-local-llm.sh`](prepare-local-llm.sh) fetches sources and Dawn
  headers; [`prepare-local-llm-weights.mjs`](prepare-local-llm-weights.mjs)
  stages weights from their descriptions;
  [`test/local-llm-browser.mjs`](test/local-llm-browser.mjs) is an opt-in
  real-model check in Chrome and Firefox.

## Limits

- Needs HTTPS or localhost and a WebGPU adapter; there is no CPU-only path.
  Firefox settles each GPU wait on a 100 ms timer
  ([bug 1870699](https://bugzilla.mozilla.org/show_bug.cgi?id=1870699)), and a
  token waits twice, so it generates about 5 tokens/s where Chrome generates
  25-80.
- `gpu@0` grants 4 GiB of buffers, 1 GiB each, for weights, KV cache and
  scratch together: a GGUF above about 3 GB cannot load on any card.
- Weight sizes are not total memory: each tab holds weights in WasmFS, the
  process and the GPU, and a model just unloaded can still hold GPU memory
  while the next one loads. Installed packages are session files: a session
  holding one is larger than a save allows.
- Qwen3.5 is a hybrid whose recurrent state cannot roll back: the engine
  keeps a checkpoint at each user message, so a new message re-evaluates the
  turn before it and tool turns evaluate only new tokens.
- The models are small: they complete short multi-step tasks and fail longer
  ones ([measurements](../../tasks/20261005-215557-local-models/TASK.md)). Image
  input is off.
