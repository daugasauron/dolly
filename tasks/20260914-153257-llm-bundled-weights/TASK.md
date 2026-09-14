# Include the smallest local Qwen model in Pi and Studio images

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: gpu,llm,images

Refreshing the previous local LLM checkpoint discarded `/run` weights and
downloaded them again. Use Qwen3.5-0.8B Q4_K_M as the default and include the
verified 579,615,840-byte GGUF in the ordinary image filesystem.

Completion requires real inference with external requests denied from cold
boot, model reuse/cancellation, refresh and session restore without downloading
weights, and saved deltas that do not duplicate the base model. Verify both Pi
and Studio can build and boot with the larger image.

Image snapshot/static delivery and Dollyfile input ceilings rise from 512 MiB
to 1 GiB. Session deltas, executable sizes and HTTP request limits stay unchanged.
The canonical Dollyfile executor compiles inside Pi-local using a reusable
module; pinned weight chunks work with the original seed executor too.

## Verified on 2026-09-14

- Pi-local: 821,902,873 bytes; Studio: 858,174,709 bytes, uncompressed.
  The browser builds took 27.4 s and 15.6 s, reusing all compiler/library bases.
  Studio successfully consumed Pi's parent image above the old 512 MiB bound.
- Normal precompiled boots now reuse the existing verified image cache.
  Session fingerprinting streams large base files; only changed records face
  the 512 MiB delta limit. This fixed the initial boot failure while indexing
  the bundled model. Cache writes remain optional when browser storage is full.
- Chrome 151 and Firefox 155 passed `node test/local-llm-browser.mjs`: real
  inference, process reuse, cancellation/restart, saved-session restore and a
  fresh image boot with external requests denied from the start. Each browser
  downloaded the image exactly once and made zero external requests. Saves were
  136,748 and 136,332 bytes. Modifying the oversized base model made saving fail;
  the previous save remained valid and restored inference from intact base bytes.
- Studio's Pi TUI selected 0.8B by default and answered a prompt with external
  requests blocked. The license and pinned weights are included in both images.
- `node test/core-browser.mjs`: Chrome and Firefox passed ABI, lifecycle,
  filesystem, C/C++, rg/fd, interruption and denied-network behavior (20.9/28.1 s).
- `npm run test:source`: 274 passed in 3.2 s. Forty pinned image recipes passed
  lint; 249 HOST inputs passed hash verification. Exact kernel import validation
  passed. Seed identity is unchanged; original recipes changed only for Pi-local
  and Studio. No main merge or deployment.

[Structured results](evidence.json). Local logs: `build/llm-baked-*.log`,
`build/llm-proof/`. Preview: `http://127.0.0.1:9097/pi-local/`.
Firefox inference remains around 0.5 tokens/s, tracked in
[the existing performance issue](../20260914-150636-llm-firefox-performance/TASK.md).
The first image load still transfers the weights; subsequent boots reuse local
image storage while it remains available. Optional larger models remain volatile.
