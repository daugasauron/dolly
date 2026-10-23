# More local models that run in Dolly and install with amy

- STATUS: OPEN
- PRIORITY: 150
- TAGS: local-llm,packages,0.1.4

Owner (2026-10-23): "search for other interesting local models you can make work in dolly
that can be installed from amy."

Today: `qwen3.5-2b` and `minicpm5-2b`, model packages that `pi-local` installs and selects
with `/local`, run by llama.cpp over `gpu@0` (`demos/local-llm/`). Qwen3.5-4B left the
catalog (2026-10-13: its four parts, and about 9 GB to build). A model package of 1.4 to 1.6
GB peaks at 6.6 to 8.2 GB in a browser while `amy install` runs.

Done when: candidates are measured against what Dolly's llama.cpp and a browser's WebGPU
take (architecture support at the pinned llama.cpp, file size and parts, memory, tokens per
second in Chromium and Firefox, quality on Pi's tool calls), and the ones worth it are amy
packages with a test each, chosen with `/local` in `pi-local`.
