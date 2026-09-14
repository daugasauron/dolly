# Investigate GPU rendering and inference inside Dolly

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: architecture,gpu,research

Investigate a browser GPU interface for source-built sandbox programs, covering
game rendering, local LLM inference, host authority, wasm64, lifecycle, and build
iteration cost. This issue tracks the investigation, not GPU implementation.

The [report](RESEARCH.md) recommends a bounded WebGPU provider with a C userspace
client, followed by ClassiCube plus its spectator and the upstream llama.cpp
WebGPU backend. It includes source findings, alternatives, proposed contracts,
implementation stages and acceptance criteria. Evidence uses Dolly `1a57397`.

[Recorded results](evidence.json) include actual shared memory64 uploads,
compute readback and OffscreenCanvas render submission in Chrome 151 and installed
Firefox 155.0.1 using explicit opt-ins. Default Linux configurations did not
provide a usable adapter. An independent C program compiled inside Dolly measured
the existing process-call round trip at median 9.697/9.902 microseconds in Chrome
and Playwright Firefox. These are capability/transport probes, not game or LLM
performance claims.

Reproduction sources remain in `build/gpu-investigation/` in
`work/core-iteration`. With that worktree's browser dependencies available:

```sh
xvfb-run -a node build/gpu-investigation/probe-chrome.mjs
node build/gpu-investigation/probe-firefox.mjs
node build/gpu-investigation/probe-process-roundtrip.mjs
```

The GPU probes use fresh profiles and a tiny localhost fixture. The process
probe uses the existing default image and compiles C inside its Wasm filesystem.
The results are archived here; the scratch harness is not a new required suite.
Report links, source notes, recorded compute values and timing medians were
checked. No production implementation or deployment is part of this result.

The [ABI follow-up](ABI.md) develops the public WebGPU C API versus Dolly wire
contract, candidate Wasm signatures and packet layouts, handle ownership,
transport versus GPU completion, mapping and compatibility. It also verifies
that the 64 MiB transfer ceiling is a removable policy choice, including the
second upload check in the Wasm kernel. It supersedes the original suggestion
of a model-specific download exception. All layouts remain proposals.
