# Browser-local inference experiment

The first implementation is WebGPU with Qwen3.5 through WebLLM 0.2.84:
0.8B, 2B (default), and 4B selected through browser controls and Pi's model picker.
The user narrowed the original two-engine proposal to this first provider.
The implemented protocol, controls and build instructions are in
[browser-local-models.md](browser-local-models.md).

This branch starts at `3db50e6826b91109663cd4d5404e5d80518c0d2b`, with Pi 0.84.4.
All implementation, caches, browser profiles and releases belong to this
worktree. Main's uncommitted changes were not imported. The initial image
build reused a copy of release
`58e0063d638fc1b81b4538a872ba4608f88a34fb5bf05c9021c2fa6f16ae2fc7`, after verifying
its manifest and matching its runtime/image sources to this baseline.

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
assets and real cancellation/tool-turn tests. A separate inference Wasm import
is justified only if the existing single HTTP slot proves insufficient for
required agent behavior. Cross-tab scheduling and persistent accelerator
workers are outside this first experiment.
