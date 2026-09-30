# GPU fluid

An upstream C fluid solver compiled inside Dolly over the [GPU interface](../../docs/gpu.md), with interactive liquid ink and volumetric smoke.

## Images

- `gpu-fluid`: Stir liquid ink and volumetric smoke. Requires WebGPU.

The experimental `Dollyfile-gpu-fluid` fetches the SHA-256-pinned, unmodified
`fluid_simulation.c` from webgpu-native-examples at
`9a7c30753d6f44630564a8316eb9c44211ff0ecc` and compiles it with Dolly's `cc`.
Its official WebGPU header and the needed cglm headers are individually pinned
URL inputs; individual raw files avoid the unavailable archive endpoint.
The recipe installs upstream licenses. `demos/gpu-fluid/prepare-gpu-fluid.mjs` packages
only the local platform adapter, GPU client and replacement controls; it does
not compile native code or patch the downloaded solver/shaders.

## Program

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

`node demos/gpu-fluid/test/gpu-fluid-browser.mjs` exercises Chrome and Firefox on the desktop and
replays captured upstream shaders, buffers and dispatches in a direct browser
worker. That comparison retains decoding, WebGPU validation, queue backpressure
and a DOM-connected canvas, but omits the C program, Dolly transport and host
admission checks. It is not a native C benchmark or an isolated ABI-overhead
measurement. The readback case compares the solver output as well as timings.
Results and screenshots go to `build/fluid-proof/`.
The same test checks interrupt/restart, malformed packets, copied input, stale
handles, quotas, capabilities and shader specialization constants.

```sh
node demos/gpu-fluid/prepare-gpu-fluid.mjs
node scripts/generate-routes.mjs
DOLLY_BUILD_IMAGES=gpu-fluid DOLLY_SNAPSHOT_IMAGE=gpu-fluid node scripts/build-system-snapshot.mjs
node demos/gpu-fluid/serve.mjs
```

The image retains the source, headers and licenses, so its Dollyfile `cc` command
can also be repeated from the running sandbox. The cached system image supplies
the compiler. Only the fluid image rebuilds when its sources change.

For this Linux experiment the Chrome test uses an isolated profile with Vulkan
and WebGPU enabled; its Firefox profile enables WebGPU and requests a blocklist
override. Both browsers render fluid on the actual X11 desktop.
Firefox presentation is still blank in the tested headless/Xvfb configurations,
including standalone WebGPU controls outside Dolly. Compute success alone does
not prove visible rendering. See [desktop evidence](../../tasks/20260914-021950-gpu-04/TASK.md)
from the original prototype. Test options do not
modify personal profiles. Browser-controlled adapter selection
uses `powerPreference: "high-performance"`; WebGPU does not provide a portable
vendor-selection API. NVIDIA and AMD use the same shader and command path.
Runtime status includes the browser's `isFallbackAdapter` value. The 0 A.D.
graphics check defaults to hardware and rejects software fallback; its explicit
`software` mode remains available for correctness checks on SwiftShader.

For an isolated Chrome window on this machine's X11 desktop:

```sh
google-chrome --user-data-dir=/tmp/dolly-gpu-preview \
  --ozone-platform=x11 --enable-unsafe-webgpu --use-angle=vulkan \
  --enable-features=Vulkan,VulkanFromANGLE http://127.0.0.1:9094/gpu-fluid/
```
