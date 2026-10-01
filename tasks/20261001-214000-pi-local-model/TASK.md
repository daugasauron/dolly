# Give pi-local a model worth using

- STATUS: OPEN
- PRIORITY: 190
- TAGS: pi,local-llm,demo,audit

Owner request (2026-10-01): the bundled local model is too weak to be
interesting; audit `pi-local` and upgrade to a better (likely larger) model.

Today `pi-local` bundles Qwen3.5-0.8B (Q4_K_M) served by the in-Dolly
llama.cpp engine over WebGPU (`demos/local-llm/`).

## Work

- Measure candidate models (quality on Pi's tool use, tokens/s and memory in
  Chrome and Firefox WebGPU) against the browser limits: the 2 GiB per-file
  import, the 8 GiB Wasm memory, WebGPU buffer limits, and download size.
- Pick the best model that is usable interactively; audit the engine path
  (prompt templates, tool-call format, context length) on the way.

## Done when

- `pi-local` ships the chosen model, the local-llm demo test passes, and the
  task records the measurements behind the choice.
