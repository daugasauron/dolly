# Experimental GPU interface

`Dollyfile-gpu-demo` adds a C shader playground without changing any existing
image. `cc` compiles its program and client inside Dolly. WGSL files remain in
`/usr/src/dolly/gpu`; edit them and rerun `gpu-demo`. Keys 1/2/3 select aurora,
prism, and an 8,192-particle compute simulation; Space pauses, Q/Escape returns
to Slop. F11 retains the browser's existing fullscreen behavior.

The compile target remains a private memory64 process with its single
`dolly_process_0.call` import. Operation 128 selects the separately versioned
GPU extension. Its canonical wire declarations are in
[`dolly-gpu-0.wat`](../abi/dolly-gpu-0.wat); generated C/JS constants are derived
from that WAT. Existing process headers, identity digests, compiler seed and
image inputs remain unchanged. An older kernel returns `ENOSYS` for this
extension. This is a deliberately small experimental C client, not a complete
implementation of `webgpu.h`, OpenGL, Vulkan, or an LLM runtime backend.

```text
C program + WGSL files in Wasm
  → process call 128 → Wasm kernel
  → env.dolly_gpu_dispatch(i64 packet, i64 bytes) → GPU worker
  → WebGPU command encoder → GPU buffers / canvas → browser compositor
```

The provider snapshots a bounded packet before acknowledging admission.
It validates structural spans before executing a batch, then checks handles,
resource types, ranges and usage as commands execute. Browser WebGPU validates
WGSL and pipeline/binding compatibility. Accepted batches are not transactions:
an execution failure can leave earlier writes/resources applied. Never replay
an accepted batch on error. Creation IDs increase within each scope and are
never recycled; scope generations distinguish process lifetimes.

The provider owns eight private scope slots, with one pending request per slot,
one visible surface, at most 128 live objects per scope, 1 MiB packets with at
most 256 records, 128 KiB shader source, 64 MiB individual buffers and 256 MiB
aggregate buffer allocations. These are experimental GPU quotas, unrelated to
the HTTP response limit. Released allocation credits wait for queue completion.
Cancellation retains a provider slot until outstanding work settles. Limits
bound admitted resources, not exact driver memory consumption or shader time.
GPU submission cannot preempt an already running shader; device loss depends
on browser/driver recovery. Worker failure wakes pending process calls with I/O
errors. No GPU request can name a URL, DOM element, host pointer or native process.

Normal frames upload only uniforms and commands. The compute scene writes a
storage buffer that its vertex shader reads on the same GPU. The canvas goes
to the browser compositor without an application RGBA readback or Dolly file
transfer. This does not promise that every browser/driver compositor is
internally copy-free. Explicit readback maps a staging buffer and returns at
most 64 KiB per call; `gpu-demo --check` computes `[3,5,7,9]` on the GPU and
writes the result to `/workspace/gpu-proof.txt` inside Wasm.

`gpu-demo --bench` measures a 64×64 uniform upload and triangle submission.
`xvfb-run -a node test/gpu-browser.mjs` compares that with the same direct
WebGPU sequence, including validation scopes and queue backpressure. These are
wall-clock operation latencies, not GPU timestamps or a universal percentage
slowdown. The test also exercises real rendering, pause, compute readback,
Ctrl-C/shell recovery, malformed packets, copied input, stale handles and quotas.
Results and screenshots go to `build/gpu-proof/`.

For this Linux experiment the Chrome test uses an isolated profile with Vulkan
and WebGPU enabled; its Firefox profile enables WebGPU and requests a WebGPU blocklist override.
The bundled Firefox still returned no adapter here; the test records that
limitation and verifies shell recovery. Installed Firefox 155.0.1 passed compute in a separate BiDi check with only
`dom.webgpu.enabled` enabled, but canvas presentation remained blank. The same
blank result occurred with a standalone main-thread WebGPU clear and a single
Worker transfer, outside Dolly. Chrome presentation is visually verified;
Firefox presentation remains a limitation of this experiment on this machine.
The installed browser may need different configuration. These test
options do not modify personal profiles. Browser-controlled adapter selection
uses `powerPreference: "high-performance"`; WebGPU does not provide a portable
vendor-selection API. NVIDIA and AMD use the same shader and command path.

Build the kernel once, then prepare only this image's source module and snapshot:

```sh
node scripts/prepare-gpu-demo.mjs
DOLLY_BUILD_IMAGES=gpu-demo node scripts/generate-routes.mjs
DOLLY_BUILD_IMAGES=gpu-demo DOLLY_SNAPSHOT_IMAGE=gpu-demo node scripts/build-system-snapshot.mjs
node scripts/serve-gpu-demo.mjs 9093
```

For an isolated Chrome window on this machine's X11 desktop:

```sh
google-chrome --user-data-dir=/tmp/dolly-gpu-preview \
  --ozone-platform=x11 --enable-unsafe-webgpu --use-angle=vulkan \
  --enable-features=Vulkan,VulkanFromANGLE http://127.0.0.1:9093/gpu-demo/
```

This prototype omits textures, depth attachments, dynamic bindings, feature/
limit negotiation and asynchronous error records. Shader diagnostics currently
appear in the browser console, while the C caller receives errno. It establishes
the command, compute, presentation and lifecycle path; it does not yet accelerate
existing games or run llama.cpp.
