# Investigate the local LLM performance gap in Firefox

- STATUS: OPEN
- PRIORITY: 200
- TAGS: gpu,llm,performance

The in-image llama.cpp checkpoint produces correct Qwen3.5-0.8B output in
Firefox 155.0, but the first measured nine-token generation took 17.017 seconds
(0.53 tokens/s). Chrome 151.0.7922.71 generated the same response in 335.870 ms
(26.8 tokens/s), with subsequent warm runs around 52 tokens/s. Browser tests
used the same pinned model and Wasm executable on the same desktop.

Reproduce with `DOLLY_LLM_BROWSERS=firefox node test/local-llm-browser.mjs` and
compare `build/llm-proof/{firefox,chromium}.json`. Chrome exposed the NVIDIA
Blackwell adapter and subgroups; Firefox redacted its adapter and lacked
subgroups. Neither difference alone establishes the cause. Background windows
and Firefox timer granularity also need controlled comparison.

Collect device identity where available, GPU timestamps, transport/wait counts
and CPU/GPU graph placement. Compare foreground browsers using identical
prompts and isolate the dominant cost before changing the ABI or adding queues.
Preserve exact capability validation and cancellation. Finish with a measured
improvement or a demonstrated external implementation blocker.
