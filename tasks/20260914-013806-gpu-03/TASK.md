# Prototype sandbox GPU ABI and a shader demo image

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: gpu,experiment

Implemented on `codex/gpu-shaders-20260914`, based on `1a57397`, in the separate
`work/gpu-shaders` worktree. The main checkout and core-iteration production
sources were not edited. All 72 preexisting recipe/snapshot hashes match their
baseline; the compiler/image identity is unchanged.

`Dollyfile-gpu-demo` inherits the existing system snapshot and compiles its C
program and GPU client inside the browser sandbox. The new snapshot is
154,462,635 bytes and takes about five seconds to build with cached dependencies.
Only this new image was built.

The [experimental contract](../../abi/dolly-gpu-0.wat) defines an additive process
operation, copied command batches, handles, completion and explicit readback.
The browser provider renders the aurora/prism scenes and an 8,192-particle GPU
compute simulation directly to its canvas. Existing games are not accelerated.
See [implementation and limitations](../../docs/gpu.md).

## Evidence

[Measured results](evidence.json):

- Chrome 151 on AMD RDNA2: all three scenes, pause, compute returning `[3,5,7,9]`
  to the Wasm filesystem, Ctrl-C/shell recovery and another GPU session pass.
- Real provider checks reject malformed spans, unknown operations, stale objects,
  closed scopes and oversized allocations. An admitted packet survives mutation
  of the original shared bytes; a structurally rejected batch has no earlier
  allocation side effect.
- Installed Firefox 155.0.1, in a temporary profile with `dom.webgpu.enabled`,
  executes compute and returns to the shell, but visual presentation is blank.
  Both BiDi and X11 screenshots show this; a standalone main-thread WebGPU
  clear and a single Worker canvas transfer also fail to present. This is
  tracked separately as gpu-04. Playwright Firefox 155.0 is blocked by its GPU
  configuration; its denial path returns to a working shell. No personal
  browser profile was changed.
- Rendering transfers zero pixel bytes through the GPU readback ABI. Screenshots
  were captured separately for visual inspection in `build/gpu-proof/`.
- Three 200-frame samples of a tiny 64×64 render batch: Dolly 255–313 us,
  direct WebGPU in a Worker 136–228 us. Medians: 261 vs 209 us (about 52 us extra).
  Both include uniform upload, encoding, error scopes and queue backpressure.
  Sequential, noisy wall-clock measurements; not GPU execution timings, NVIDIA
  measurements, or a prediction for a game/LLM workload.
- NVIDIA is present but unavailable to this measurement: loaded kernel driver
  580.173.02 and NVML 580.178 report a driver/library mismatch. No driver changes.
- Exact typed browser import validation, the existing browser boundary proof
  against the unchanged system snapshot, and 17 focused ABI/release checks pass.

Local demo: `node scripts/serve-gpu-demo.mjs 9093`, then
`http://127.0.0.1:9093/gpu-demo/` in a browser exposing WebGPU.
Controls: 1/2/3, Space, Q/Escape; existing F11 fullscreen remains.
