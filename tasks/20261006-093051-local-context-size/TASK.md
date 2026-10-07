# Local models: let the user change the context size

- STATUS: CLOSED
- PRIORITY: 70
- TAGS: local-llm,pi,configuration

## Closed (2026-10-07, `fix/visible`)

The owner's request is met and measured: the context size is set from
`/local` → Parameters, the engine reloads with it at the next prompt, Pi's
window follows, and a size the GPU cannot hold ends as the turn's error
with Pi alive (the run below). Remaining, as open points and not passes:

- The oversized value is refused only after the weights are loaded, so a
  person waits for a load that fails. It could be refused before loading:
  the binding limit is not the adapter's but `gpu@0`'s, 4 GiB in all and
  1 GiB per buffer, both known in advance; the KV cache per context token
  follows from the GGUF's metadata (layers with attention, KV heads, head
  size) and the shader kind (f16 or f32 cache), which `dolly-llama` can
  print from `--check` plus the model file, or the model description can
  carry as a measured bytes-per-token figure beside its `gpu` entry. Then
  `editParameters` would refuse a `contextWindow` whose cache, with the
  weights, exceeds the grant, naming the need, before any load.
- Pi's compaction settings (`reserveTokens` 4096, `keepRecentTokens`
  6144, sized for 16k) do not follow a smaller context.
- The override across a restart of Pi was not measured; it is Pi's own
  `models.json`, read at start.

## Test (2026-10-07, `fix/visible` 87fdfe07)

`demos/local-llm/test/local-llm-browser.mjs`, beside the temperature
change, on the model chosen with `/local`: `contextWindow` set to
1,048,576, then a prompt, which must end in the engine's refusal as the
turn's error with Pi alive (`asked for`, `Unable to create inference
context` or `Local model exited`); then 12,288, after which Pi's footer
shows `/12k` before any prompt, the task runs again, and the shell checks
`"contextWindow": 12288` in `~/.pi/agent/models.json` and llama.cpp's
`n_ctx = 12288` in `~/.cache/dolly-llm/engine.log`. The refusal is the
engine's, after the weights are loaded: a refusal before loading that
names the need is still not built.

Run once on the RTX 5070 (Xvfb :142, 16 GB scope, 08:36-08:52,
`build/visible-evidence/local-llm.log` in `work/visible`): passed in
`pi-local` and `dollyfile-studio`, Chromium (f32 shaders, MiniCPM5-2B
chosen) and Firefox (f16, Qwen3.5-4B). The refusal, as Pi shows it
(`build/llm-proof/*-refused-context.png`): "Error: Dolly WebGPU: out of
GPU memory (the device's, or gpu@0's 4 GiB); MiniCPM5-2B needs 3.4 GB of
GPU memory with 16384 tokens of context, and more with the 1048576 asked
for", the footer at `0.2%/1.0M (auto)`, Pi taking the next command. With
12,288 the footer read `/12k` before the prompt, the task completed with
the reloaded model, and `n_ctx = 12288` is in `engine.log`. Not measured:
the override across a restart of Pi (it is Pi's own `models.json`), and
nothing follows the context size in the compaction settings.

## Remaining (2026-10-07)

Done with `20261005-215557-local-models` (closed; its "Context size"
section): `/local` → Parameters writes `modelOverrides.ID.contextWindow`,
the engine restarts with it at the next prompt, Pi's window and compaction
threshold follow (footer `5.2%/33k (auto)` at 32,768); measured with the 2B
in Chrome: 32,768 completes a task at 2,730 MiB against 2,245 at 16,384;
131,072 fails at load with the out-of-memory line. Left:

- A refusal before loading, naming what the size needs (memory per context
  token in the model's description), and a bound at the trained context.
- Pi's compaction settings (`reserveTokens` 4096, `keepRecentTokens` 6144,
  sized for 16k) following a smaller context.
- The browser test on a hardware adapter for the refusal, and the override
  shown to survive a restart of Pi (it is a file Pi reads at start).

Owner (2026-10-06): "For the pi-local webgpu models, I want to be able to
change the context size. Create a low prio task for this."

Today the context length is fixed per model: `demos/local-llm/models.json`
gives each model a `context`, the provider reports it to Pi as
`contextWindow`, and the engine creates the llama context with it
(`cp.n_ctx=context` in `demos/local-llm/main.cpp`). The user cannot change it.

It belongs with `20261005-215557-local-models`: that work moves each model's
description into its package and adds `/local` for per-user parameters
(temperature and the like, stored as Pi's `modelOverrides`). Context size is
one more such parameter, with two differences to handle:

- It is fixed when the model is loaded, so changing it reloads the model, and
  the KV cache of the running conversation is lost.
- It costs GPU memory, and `gpu@0` caps buffers at 4 GiB in total: a size that
  does not fit must be refused with the measured requirement, before loading,
  and never above what the model was trained for.

Pi's compaction settings in the image (`reserveTokens`, `keepRecentTokens`)
assume the current size; they should follow the chosen one.

## Done when

- A user sets the context size for a local model from inside Pi (`/local`),
  it survives a restart of Pi, and Pi's reported context window and its
  compaction follow it.
- A size the adapter cannot hold is refused with one line naming what it
  needs; shown by a browser test on a hardware adapter.
- The GPU memory per model and context size is recorded for the sizes offered.
