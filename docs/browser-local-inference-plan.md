# Browser-local inference experiment

The first implementation is WebGPU with Qwen3.5 through WebLLM 0.2.84:
0.8B, 2B (default), and 4B selected through browser controls and Pi's model picker.
The user narrowed the original two-engine proposal to this first provider.
The implemented protocol, controls and build instructions are in
[browser-local-models.md](browser-local-models.md).

The independent worker exposes an OpenAI-compatible service through the
existing HTTP broker. The Wasm ABI is unchanged. Browser controls load the
approved size; guest requests only select a public ID and supply bounded
conversation/tool data. The worker returns descriptions of tool calls. Pi
executes them through ordinary Dolly commands and files.

The `pi-local` leaf image derives from the completed Pi image and installs one
extension. Neither host engine changes nor model selection rebuild Pi. The
existing module viewer remains the place to inspect the image composition.
There is no new Dollyfile syntax, dependency solver or module compatibility
system in this experiment.

Qwen needs a model-specific translation because this WebLLM release's native
tool API supports Hermes models. A small adapter uses a constrained tool-call
envelope and ordinary text answers. An early experiment requiring every
answer to be JSON caused poor tool selection. The 0.8B model also struggled
with completing file tasks, so the default is 2B. These are integration choices,
not a claim that this small model is a reliable autonomous coding agent.

The WebLLM IndexedDB backend is deliberate: its downloads pass through the
worker's fixed-asset Fetch guard. CacheStorage's native `add` path bypasses
that guard. Asset identities remain stable across Dolly recipe/release edits.
Normal browser networking keeps its separate policy and credential rules.

The remaining extension point is another engine worker speaking the same
model-discovery/completion format. wllama is deferred; it needs its own pinned
assets and real cancellation/tool-turn tests. The existing HTTP broker remains
the sole guest-selected service boundary. Cross-tab scheduling and persistent accelerator
workers are outside this first experiment.
