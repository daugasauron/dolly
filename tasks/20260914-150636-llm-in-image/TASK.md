# Run local Qwen inference inside the image through the Dolly GPU ABI

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: gpu,llm,checkpoint

Replace browser-owned WebLLM inference with a source-built Wasm64 program.
Keep work on `codex/gpu-shaders-20260914`; do not merge or deploy to main.

## Implementation

Unchanged llama.cpp `093a2f86c3e37c54fa3e1f9efb17b304f3433abd` and its WGSL compile
inside Dolly using CMake and the in-image C/C++ compiler. Official Dawn headers
are pinned at `v20260908.214631`; no Dawn JavaScript runtime is used. Archive
hashes live in `config/source-pins.sh`. Model revisions, sizes and SHA-256 hashes
live in `src/local-llm/models.json`.

`llama-build` retains reusable upstream libraries; `local-llm-build` compiles the
C API adapter and JSON-lines command. `pi-local` copies the executable, licenses
and ordinary Janis provider; Studio inherits it. Tokenization, sampling, model
files, conversation formatting, scheduling and tool execution stay in Wasm.

The GPU ABI adds CAPABILITIES (128-byte feature/limit reply) and up to sixteen
numeric compute pipeline constants. It retains the single typed GPU outer
import and existing records. The provider clamps device limits, admits at most
1 GiB per buffer and 4 GiB total, and allows 4,096 objects per scope. Existing
shader and fluid images use their unchanged packets and snapshots.

Removed WebLLM, its asset catalog/bundler, browser model service/worker/menu and
obsolete mock tests. Model choice now uses Pi's `/model`; Qwen3.5-2B is the
default. The first prompt performs a GPU preflight, downloads 32 MiB ranges
through ordinary sandbox HTTP, verifies with the compiled `sha256sum`, and
launches `dolly-llama`. Janis's JS hash retained all chunks and was too slow for
GGUF files; the existing command avoids that extra whole-file JS allocation.
Cancellation kills only the private inference process; subsequent requests
reload it. Normal requests reuse the loaded process.

`/run` is now explicitly volatile in session capture/restore. Weights in
`/run/dolly-llm` survive model restarts in a live tab but require downloading
after refresh or session restore. Settings, conversations and workspace files
remain saveable. The session size/format and image/seed ABI are unchanged.

## Evidence on 2026-09-14

- Real upstream compilation inside the browser: 158.6 s for the library base;
  12.5 s for the adapter/command. A provider-only edit rebuilt Pi in 7.1 s and
  Studio in 11.9 s, reusing all compiler and library ancestors.
- Chrome 151.0.7922.71, NVIDIA RTX 5070, driver 580.178.04: Qwen3.5-2B generated
  90 tokens in 1,762.870 ms (**51.05 tokens/s**), prefill 171.315 ms for a
  21-token prompt, context 8,192. Output described a forest in four sentences.
  This is one wall-clock sample including Dolly transport, not isolated GPU time.
- 0.8B and 2B generated real text and survived cancellation/restart. Two ordinary
  requests reused the same process PID. 2B answered a basic arithmetic question.
- Pi 0.84.4 registered all three local model IDs. A real 2B tool turn wrote
  `HELLO FROM INSIDE DOLLY`, read the file, and reported its contents. JSON events
  separately confirm successful write/read execution. A second task added
  unwanted prose: working tool transport does not establish model reliability.
- Chrome without the f16 opt-in failed preflight with the missing-feature error
  and made zero Hugging Face requests; Pi and its shell survived.
- `node test/gpu-browser.mjs`: Chrome and Firefox passed visible scene changes,
  compute readback, three interrupt/restart cycles, malformed packets, copied
  inputs, stale handles, quotas, capabilities and pipeline constants.
- `node test/fluid-browser.mjs`: Chrome and Firefox passed upstream solver
  readback and rendering/control checks. Existing shader/fluid snapshot hashes
  and all original image files except Pi-local/Studio remain unchanged.
- `node test/local-llm-browser.mjs`: Chrome and Firefox passed fresh in-sandbox
  download/SHA verification, generation, cancellation, process reuse/restart,
  inference with external requests denied, and session save/restore. Saved
  deltas were under 1 MiB with a 580 MB model resident; weights were absent after
  restore while workspace files and model settings survived. Studio's TUI and
  local model catalog also passed. [Structured evidence](evidence.json).
- `npm run test:source`: 273 passed, 0 failed, 3.3 s.
  `node scripts/lint-dollyfiles.mjs`: 40 pinned image recipes passed.
  Built kernel has exactly the imports in `dolly-browser-0.wat`.

Local logs: `build/llm-{first-answer,2b-bench}.jsonl`,
`build/llm-chrome-2b-proof.json`, `build/llm-pi-tools.jsonl`,
`build/llm-negative.log`, `build/llm-proof/`, `build/gpu-proof/` and
`build/fluid-proof/`. Reproduce with:

```sh
npm run image -- pi-local
node test/local-llm-browser.mjs
node test/fluid-browser.mjs
node scripts/serve-gpu.mjs 9097 pi-local
```

The real-model test downloads 0.8B in each isolated browser, then checks process
reuse, cancellation, restart with external requests denied, and session
save/restore without the large volatile model. Embedding-owned Worker scripts
still need to load; this does not claim the entire website boots offline.

## Compatibility limits

`shader-f16` is required. On this NVIDIA/Linux setup Chrome needs Dawn's
`vulkan_enable_f16_on_nvidia` testing toggle; personal profiles are untouched.
Firefox exposes f16 without that Chrome option, but its first measured 0.8B
run was only about 0.5 tokens/s. Its adapter identity is redacted and the cause
of the performance gap is [tracked separately](../20260914-150636-llm-firefox-performance/TASK.md).
4B is catalogued but not verified.
Context is 8,192 tokens; image input and thinking are disabled. Persistent model
caching across refresh is outside this checkpoint.
