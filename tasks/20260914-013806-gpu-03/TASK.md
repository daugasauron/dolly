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

[Measured results](evidence.json), repeated after reboot with NVIDIA kernel and
userspace driver 580.178.04 matching:

- Chrome 151 on NVIDIA Blackwell (RTX 5070), and desktop Firefox 155.0: visible
  scene changes, pause, compute returning `[3,5,7,9]` to the Wasm filesystem,
  and three immediate Ctrl-C/restart cycles pass. AMD RDNA2 passed the initial run.
- Real provider checks reject malformed spans, unknown operations, stale objects,
  closed scopes and oversized allocations. An admitted packet survives mutation
  of the original shared bytes; a structurally rejected batch has no earlier
  allocation side effect.
- Installed Firefox 155.0.1, in a temporary profile with `dom.webgpu.enabled`,
  also visibly renders all three scenes on the actual X11 display and passes
  compute. Headless/Xvfb presentation still fails; see gpu-04. No personal
  browser profile was changed.
- Rendering transfers zero pixel bytes through the GPU readback ABI. Screenshots
  were captured separately for visual inspection in `build/gpu-proof/`.
- Three 200-frame samples of a tiny 64×64 render batch on the actual display:
  Chrome medians 834 us through Dolly vs 755 us directly; Firefox 1001 vs 500 us.
  Both paths include uniform upload, encoding, error scopes, queue backpressure
  and a DOM-connected OffscreenCanvas. Chrome's client-minus-provider times are
  roughly 48–58 us; Firefox's are 489–521 us. These approximate scheduling/transport
  costs include no GPU timestamp measurement and predict neither games nor LLMs.
- The initial AMD comparison used an unattached canvas for the direct baseline.
  Its reported 52 us difference did not isolate ABI overhead and is superseded.
  Sequential wall-clock timings remain noisy and sensitive to display setup.
- Exact typed browser import validation, the existing browser boundary proof
  against the unchanged system snapshot, and 17 focused ABI/release checks pass.

The desktop run exposed an immediate-restart race: the kernel could reuse a
lease while its provider slot was still retiring submitted work. Open admission
now defers until retirement completes; resource credits remain reserved. The
regression exercises three immediate interruptions/reopens in each browser.
Only the kernel was rebuilt; all original snapshots and the demo snapshot are
unchanged.

The shader playground has been removed. Use the upstream
[fluid image](../../docs/gpu.md) for current rendering and boundary checks.
The measurements here describe the original prototype.
Controls: 1/2/3, Space, Q/Escape; existing F11 fullscreen remains.
