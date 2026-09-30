# Experimental GPU interface

The [combined checkpoint](../tasks/20260914-160027-gpu-checkpoint/TASK.md) records the
first GPU applications, verified artifacts and browser limits.

[`Dollyfile-gpu-sdk`](../Dollyfile-gpu-sdk) and its reusable
[`gpu` module](../modules/gpu.dm) compile the client library inside Dolly.
Programs include `<dolly/gpu.h>` and link with `-ldolly-gpu`. The texture/depth/
indexed-rendering browser test links against this installed SDK; the fluid demo
(`demos/gpu-fluid`) is an application above it.

The compile target remains a private memory64 process with its single
`dolly_process_0.call` import. Operation 128 selects the separately versioned
GPU extension. Its canonical wire declarations are in
[`dolly-gpu-0.wat`](../abi/dolly-gpu-0.wat); generated C/JS constants are derived
from that WAT. Existing process headers, identity digests, compiler seed and
image inputs remain unchanged. An older kernel returns `ENOSYS` for this
extension. This is a deliberately small experimental C client, not a complete
implementation of `webgpu.h`, OpenGL or Vulkan. The local llama.cpp adapter
compiles above this interface (`demos/local-llm`).

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
one visible surface, at most 4,096 live objects per scope, 1 MiB packets with at
most 1,024 records, 128 KiB shader source, 1 GiB individual buffers and 4 GiB
aggregate buffer/texture allocations. Legacy commands accept sixteen buffer
bindings and one vertex stream with eight float32x2/x3/x4 attributes.
Clients check CAPABILITIES bit 128 before exceeding the legacy 256-record limit.
These are experimental GPU quotas, unrelated to
the HTTP response limit. Release invalidates a handle immediately without waiting
for the GPU. Pending allocations and object slots remain charged until queue
completion; explicit WAIT and CLOSE also collect completed releases.
Cancellation retains a provider slot until outstanding work settles. An immediate
restart defers its open until the provider retires the old scope and wakes it.
Limits bound admitted resources, not exact driver memory consumption or shader time.
GPU submission cannot preempt an already running shader; device loss depends
on browser/driver recovery. Worker failure wakes pending process calls with I/O
errors. No GPU request can name a URL, DOM element, host pointer or native process.

Normal frames upload only uniforms and commands. Storage buffers written by a
compute pass can feed a rendering shader on the same GPU. The canvas goes
to the browser compositor without an application RGBA readback or Dolly file
transfer. This does not promise that every browser/driver compositor is
internally copy-free. Explicit readback maps a staging buffer and returns at
most 64 KiB per call.

`CAPTURE_FRAME` records an optional surface-to-buffer copy after a render and
before its submit. It copies only the owned surface rectangle, with four bytes
per pixel and row stride rounded up to 256 bytes. CAPABILITIES bits 16 and 32
report capture support and BGRA8 byte order (otherwise RGBA8). Agents can use
this for selected observations; normal frames do not read pixels back.

CAPABILITIES reports admitted feature bits and device-clamped limits in a fixed
128-byte record. COMPUTE_CONSTANTS adds up to sixteen named finite numeric
pipeline constants. Existing packets remain compatible. These additions support
unchanged llama.cpp WGSL and introduce no additional outer imports.

CAPABILITIES bit 64 admits additive texture rendering records 18–26. They provide
2D/cube textures and mip uploads, samplers, one color and optional depth/stencil
attachment, indexed/instanced draws, eight vertex streams, sixteen attributes,
four typed resource groups, blend/depth/cull state and viewport/scissor controls.
Existing record layouts remain unchanged. Texture formats and all packed layouts
are specified in the WAT contract. Textures count against the same allocation
quota as buffers; the provider exposes no external image or URL import.

Bit 256 admits BC1/BC2/BC3 compressed textures when the adapter supports them.
Their base dimensions and upload extents contain whole 4×4 blocks, including
the smallest mip levels. Allocation accounting includes every padded block.
Clients retain an uncompressed path for adapters without this feature.

Bit 512 admits `float16x2` and `float16x4` vertex formats. Vertex fetch converts
these to `f32` shader inputs without requiring the separate `shader-f16` feature.

Passes must end before submit and cannot cross packets. Queue uploads execute
before submitted draws: use separate aligned uniform ranges for different draws
or submit before overwriting a consumed range. Bind groups use fixed offsets;
there is no dynamic-offset or native graphics API adapter. Shader diagnostics
appear in the browser console while the C caller receives errno.

`node test/gpu-render-browser.mjs` compiles its C fixture inside Dolly and checks
texture colors, depth occlusion, indexed meshes, multiple streams/groups,
offscreen sampling, viewport bounds and close/interrupt/restart cleanup. It also
runs the GPU boundary proof. Chromium and Firefox use a desktop hardware adapter
and reject a fallback adapter. This checks correctness, not benchmark performance.
No runtime or default image rebuild is needed when only the provider and these
fixture sources change.
