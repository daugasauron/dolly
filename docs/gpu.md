# GPU

`gpu@0` is an experimental extension for bounded WebGPU command packets. Programs
keep their single `dolly_process_0.call` import; operation 128 selects the GPU
extension, so the base process ABI and its digest are unchanged and older
kernels return `ENOSYS`. It is a small C client, not `webgpu.h`, OpenGL or Vulkan.

```mermaid
flowchart LR
  prog["C program + WGSL"] -- "process call 128" --> kernel["Kernel host/gpu/kernel.c"]
  kernel -- "env.dolly_gpu_dispatch(packet, bytes)" --> bridge["gpu-bridge.mjs"]
  bridge --> worker["GPU Worker: gpu-worker.mjs"]
  worker --> webgpu["WebGPU device"] --> canvas["OffscreenCanvas to compositor"]
```

- Contract and packet layouts: [`host/gpu/dolly-gpu-0.wat`](../host/gpu/dolly-gpu-0.wat); C
  and JavaScript constants are generated from it. Client: [`host/gpu/gpu.h`](../host/gpu/gpu.h),
  [`host/gpu/client.c`](../host/gpu/client.c), in the seed as `libdolly-gpu.a`, which `cc` links
  by default.
- The kernel ([`host/gpu/kernel.c`](../host/gpu/kernel.c)) ties each scope to a process
  and revokes it on exit, abort or forced termination.
- The provider copies each packet before acknowledging it and validates structure
  before executing; WebGPU validates WGSL and pipelines. Accepted batches are not
  transactions: never replay one after an error.
- Quotas: 8 scopes with one pending request each, 1 MiB packets of at most 1,024
  records (clients check `CAPABILITIES` before exceeding 256), 128 KiB shaders,
  4,096 objects per scope, 1 GiB per buffer, 4 GiB of buffers and textures in
  total, 16 bindings. Released handles are invalid at once; their allocation
  stays charged until the GPU finishes.
- `CAPABILITIES` returns a fixed 128-byte record of feature bits and
  device-clamped limits: frame capture (16), BGRA surfaces (32), textured
  rendering (64), large batches (128), BC textures (256), f16 vertices (512).
- Normal frames go to the compositor without readback. Explicit readback returns
  at most 64 KiB per call; `CAPTURE_FRAME` copies the caller's own surface
  rectangle into its buffer.
- No packet names a URL, DOM node, host pointer or native process. Shader time and
  driver memory are not bounded; device loss depends on the browser. A failed
  GPU Worker wakes pending calls with `EIO`.

## Enabling WebGPU

While `gpu@0` is enabled, the page shows the adapter its programs get: `GPU`
with the name the browser gives, `CPU (software GPU)` for a fallback adapter,
SwiftShader or llvmpipe, or `No GPU` with the reason and a link here. Guest
frames cannot cover it. An image that requires `gpu@0` stops before ENTRY when
the page gets no adapter; when the GPU Worker gets none, `OPEN` fails with
`ENODEV` (`ENOSYS` without `navigator.gpu`); in an image without `gpu@0`, calls
fail with `ENOSYS`. Measured on Linux with an NVIDIA GPU (Chrome 151, Firefox
156, 2026-10-01): neither browser offers WebGPU by default.

- Chrome: enable `chrome://flags/#enable-unsafe-webgpu` and
  `chrome://flags/#enable-vulkan`, set `chrome://flags/#use-angle` to Vulkan,
  and relaunch; or start it with
  `--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=vulkan`. Each
  flag alone, and the first two together, still gave no adapter.
  `chrome://gpu` shows the result.
- Firefox: set `dom.webgpu.enabled` to `true` in `about:config` and restart.
  The browser tests' Playwright Firefox build returns no adapter even then
  under Xvfb or without a display; on the desktop it gets an unnamed one.
- Headless Chrome with `--disable-gpu --enable-unsafe-webgpu`, as the core
  browser tests run, gets the SwiftShader software adapter.
