# Local models: let the user change the context size

- STATUS: OPEN
- PRIORITY: 70
- TAGS: local-llm,pi,configuration

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
