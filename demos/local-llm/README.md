# Local models

Upstream llama.cpp runs as an ordinary wasm64 process over the core `gpu@0`
interface, serving open models to Pi with no browser model loader, local server
or remote fallback.

## Images

- `pi-local`: Pi with the bundled Qwen3.5-2B; `/local` installs and switches models. Requires WebGPU.
- `llama-build`: llama.cpp libraries built for the GPU interface.
- `local-llm-build`: The dolly-llama command built from those libraries.
- `llama`: `dolly-llama`, llama.cpp on WebGPU serving a GGUF over stdin and stdout; it needs `gpu@0`.
- `qwen3.5-2b`: Model package: Qwen3.5-2B weights, description and license.
- `qwen3.5-4b`: Model package: Qwen3.5-4B weights, description and license.
- `minicpm5-2b`: Model package: MiniCPM5-2B weights, description and license.
- `lfm2.5`: Model package: LFM2.5-2.6B weights, description and license.

Open `/pi-local/` (or Dollyfile Studio) and ask; the first prompt loads the
bundled model. In Pi, `/local` lists every model of the release with the GPU
memory it needs on this adapter and its state. Choosing one that is not
installed runs `amy install` for its packages and switches to it; choosing an
installed one switches; **Parameters** changes sampling, context size and
output limit; **Unload** frees the GPU. `/model` and `/thinking` are Pi's own:
any provider's models, and reasoning on or off. Build with
`npm run image -- pi-local`.

| Model | Packages | Download | GPU memory, f16 / f32 | Task, Chrome / Firefox | Tokens/s, Chrome / Firefox |
| --- | --- | ---: | ---: | ---: | ---: |
| Qwen3.5-2B | `qwen3.5-2b` (bundled) | 1.40 GB | 2.1 / 2.3 GB | 8 of 8 / 4 of 4 | 63 / 5 |
| MiniCPM5-2B (2.6B parameters) | `minicpm5-2b` | 1.56 GB | 2.4 / 3.4 GB | 8 of 8 / 4 of 4 | 61 / 5 |
| Qwen3.5-4B, 3-bit (Q3_K_S) | `qwen3.5-4b` | 2.11 GB | 3.2 / 3.8 GB | 4 of 4 / 2 of 2 | 33 / 5 |
| LFM2.5-2.6B | `lfm2.5` | 1.67 GB | 2.3 / 3.4 GB | 1 of 4 / 0 of 1 | 70 / 5 |

Q4_K_M weights unless named, 16,384 tokens of context, thinking off, on an
NVIDIA RTX 5070. GPU memory is Chrome's peak in `nvidia-smi` with one model
loaded; an integrated GPU shares system memory. The task: list a directory,
write a C program, compile it, run it and report its output
([measurements](../../tasks/20261005-215557-local-models/TASK.md), and for the
4B and LFM2.5 [these](../../tasks/20261023-160001-local-models/TASK.md)). The
4B completes more of the longer tasks there than the 2B, at less than half its speed.
LFM2.5 always reasons before it answers, whatever `/thinking` says; it is under
the LFM Open License v1.0, whose text the package installs: commercial use is
licensed below 10 million US dollars of annual revenue.

## A model is a package

A model package installs `/usr/share/dolly/llm/ID.json` beside its weights; the
provider lists that directory and names no model. Adding one is
[`models/ID.json`](models/), a recipe per package and a row in
[`config/upstreams.json`](../../config/upstreams.json). The description holds
what no upstream file knows:

- `source`: the pinned upstream GGUF and the license file shipped with it.
- `packages`, `files`: what `amy install` takes and the weight files with their
  sizes. A model is installed when the files are there.
- `gpu`: GPU memory in GB measured with f16 and with f32 shaders.
- `pi`: a Pi model definition (Pi's `docs/models.md`), passed through:
  context, output limit, whether it reasons, and the publisher's sampling where
  the GGUF carries none.

Everything else is the GGUF's, read by llama.cpp's own code in `dolly-llama`:
the chat template and its special tokens, the tool-call syntax, grammar and
parser, stop tokens, the thinking switch and `general.sampling.*` defaults.

A user's changes are Pi's files: `/model`, `/thinking` and the model chosen in
`/local` are saved in `~/.pi/agent/settings.json`, and `/local` writes
`modelOverrides` for provider `webgpu` in `~/.pi/agent/models.json`
(`samplingParams`: `temperature`, `top_p`, `top_k`, `min_p`, `repeat_penalty`,
`presence_penalty`, `frequency_penalty`, `seed`; `contextWindow`; `maxTokens`). Each request draws a fresh seed unless
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
which saves memory.

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
  extension adds `/local`. One engine serves every session of a Pi process.
  A small model can repeat itself: a third identical tool call after two
  identical results is not run and the model reads why; if it insists, the run
  stops and Pi says so
  ([the loop](../../tasks/20261005-215204-pi-local-loop/TASK.md)).
- [`SYSTEM.md`](SYSTEM.md): the guidance for a session that starts on a local
  model, with the commands on `PATH`, in place of Pi's Dolly guidance written
  for large models; a bash result that says `command not found` adds that the
  prompt lists the installed commands. A 2B model answers from its prompt and
  seldom reads the `dolly` skill
  ([measurements](../../tasks/20261023-160000-pi-local-smooth/TASK.md)).
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
- A package is an image and an image holds at most 2 GiB, so a model's weights
  do too ([the limit](../../tasks/20261013-143039-qwen-4b-out/TASK.md)).
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
