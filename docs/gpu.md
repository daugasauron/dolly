# Experimental GPU interface

The [combined checkpoint](../tasks/20260914-gpu-checkpoint/TASK.md) records the
fluid image, in-sandbox local inference, verified artifacts and browser limits.

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
implementation of `webgpu.h`, OpenGL or Vulkan. The local llama.cpp adapter
compiles above this interface; see [local models](browser-local-models.md).

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
most 256 records, 128 KiB shader source, 1 GiB individual buffers and 4 GiB
aggregate buffer allocations. A bind group accepts at most sixteen buffers;
vertex input accepts one buffer with up to eight float32x2/x3/x4 attributes.
These are experimental GPU quotas, unrelated to
the HTTP response limit. Released allocation credits wait for queue completion.
Cancellation retains a provider slot until outstanding work settles. An immediate
restart defers its open until the provider retires the old scope and wakes it.
Limits bound admitted resources, not exact driver memory consumption or shader time.
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

`Dollyfile-gpu-fluid` compiles the unchanged upstream
[fluid simulation](https://github.com/samdauwe/webgpu-native-examples/blob/9a7c30753d6f44630564a8316eb9c44211ff0ecc/src/examples/fluid_simulation.c)
inside Dolly. It retains the solver and WGSL, with a scoped C adapter for the
WebGPU functions it uses and Dolly input/timing in place of its window library.
The ImGui panel is disabled and replaced by a C/GPU control panel. The pinned
official `webgpu.h` supplies types; the adapter is not a complete WebGPU C API.
Fourteen bindings and per-vertex input are exercised by the actual program.
Consecutive dispatch records share a compute pass; other records end that pass.

Move the pointer to stir. Controls select output size, solver grid height,
pressure iterations, ink, volumetric smoke or smoke with shadows. H toggles
controls, Space pauses, R resets, A toggles automatic stirring, and Q/Escape
returns to Slop. F11 remains the browser's fullscreen key. Grid widths follow
the image aspect ratio; the dye field has its own upstream resolution.

The optional INFO reply reports GPU pass timestamps asynchronously, with three
fixed query/readback slots. Busy slots skip samples. These times sum compute
and render passes, excluding copies between passes, transport and CPU work;
they are not complete frame latency. Frames still reach the compositor without
pixel readback. `fluid --check` explicitly reads dye back into Wasm and verifies
finite, nonzero evolution. `fluid --bench 512 1080 120` measures 120 steps after
20 warmups, without frame pacing or the panel; initialization is excluded.
Append `smoke` or `shaded` to benchmark the volumetric rendering modes.

`node test/fluid-browser.mjs` exercises Chrome and Firefox on the desktop and
replays captured upstream shaders, buffers and dispatches in a direct browser
worker. That comparison retains decoding, WebGPU validation, queue backpressure
and a DOM-connected canvas, but omits the C program, Dolly transport and host
admission checks. It is not a native C benchmark or an isolated ABI-overhead
measurement. The readback case compares the solver output as well as timings.
Results and screenshots go to `build/fluid-proof/`.

```sh
node scripts/prepare-gpu-fluid.mjs
node scripts/generate-routes.mjs
DOLLY_BUILD_IMAGES=gpu-fluid DOLLY_SNAPSHOT_IMAGE=gpu-fluid node scripts/build-system-snapshot.mjs
node scripts/serve-gpu-demo.mjs 9094 gpu-fluid
```

The image retains the source, headers and licenses, so its Dollyfile `cc` command
can also be repeated from the running sandbox. The cached system image supplies
the compiler. Only the new fluid image rebuilds;
existing recipes and snapshots, including the shader playground, remain intact.

`gpu-demo --bench` measures a 64×64 uniform upload and triangle submission.
Run `node test/gpu-browser.mjs` on the desktop display to compare that with the
same direct WebGPU sequence. Both use a DOM-connected OffscreenCanvas, validation
scopes and queue backpressure. An unattached canvas is not an equivalent baseline.
These are wall-clock operation latencies, not GPU timestamps or a universal
percentage slowdown. Provider timings include asynchronous waits; their difference
from client timings is only an approximate measure of transport and scheduling.
The test also exercises visible scene changes, pause, compute readback,
repeated Ctrl-C/restart, malformed packets, copied input, stale handles and quotas.
Results and screenshots go to `build/gpu-proof/`.

For this Linux experiment the Chrome test uses an isolated profile with Vulkan
and WebGPU enabled; its Firefox profile enables WebGPU and requests a blocklist
override. Installed Firefox 155.0.1 also renders all three scenes on the actual
X11 desktop in a temporary profile with only `dom.webgpu.enabled` enabled.
Firefox presentation is still blank in the tested headless/Xvfb configurations,
including standalone WebGPU controls outside Dolly. Compute success alone does
not prove visible rendering. See [desktop evidence](../tasks/20260914-021950-gpu-04/TASK.md)
and [measurements](../tasks/20260914-013806-gpu-03/TASK.md). Test options do not
modify personal profiles. Browser-controlled adapter selection
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

CAPABILITIES reports admitted feature bits and device-clamped limits in a fixed
128-byte record. COMPUTE_CONSTANTS adds up to sixteen named finite numeric
pipeline constants. Existing packets remain compatible. These additions support
unchanged llama.cpp WGSL and introduce no additional outer imports.

This prototype omits textures, depth attachments, dynamic bindings and
asynchronous error records. Shader diagnostics currently
appear in the browser console, while the C caller receives errno. It establishes
the command, compute, presentation and lifecycle path; it does not yet accelerate
existing game renderers.
