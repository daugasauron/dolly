# Local models: let the user change the context size

- STATUS: OPEN
- PRIORITY: 70
- TAGS: local-llm,pi,configuration

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
names the need is still not built. Results below when the images exist.

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
