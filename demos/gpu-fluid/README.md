# GPU fluid

The unmodified upstream C fluid solver from webgpu-native-examples, compiled inside
Dolly over the core `gpu@0` interface, with liquid ink and volumetric smoke.

## Images

- `gpu-fluid`: Stir liquid ink and volumetric smoke. Requires WebGPU.

Open `/gpu-fluid/`; build with `npm run image -- gpu-fluid`.

## Use

Move the pointer to stir. H toggles controls (output size, grid height, pressure
iterations, ink, smoke, shadows), Space pauses, R resets, A toggles automatic
stirring, Q or Escape returns to Slop. `fluid --check` verifies the solver;
`fluid --bench 512 1080 120 [smoke|shaded]` times 120 steps.

## Key files

- [`Dollyfile-gpu-fluid`](Dollyfile-gpu-fluid): fetches the SHA-256-pinned
  `fluid_simulation.c`, `webgpu.h` and cglm headers by external `SOURCE` URLs
  and compiles them with `cc`.
- [`src/webgpu.c`](src/webgpu.c): the WebGPU C functions the solver uses, over
  `gpu@0`; not a complete WebGPU API.
- [`src/app.c`](src/app.c): Dolly input, timing and a replacement control panel
  for ImGui.
- [`test/fluid-browser.mjs`](test/fluid-browser.mjs): Chrome and Firefox
  rendering, interrupt/restart and packet validation.

## Limits

- Needs a hardware WebGPU adapter. Firefox presentation was blank under
  headless/Xvfb in testing; compute success alone does not prove rendering.
- GPU pass timestamps exclude copies, transport and CPU work; they are not frame
  latency.

Test: `npm run test:demos -- gpu-fluid` ([`test/`](test/)).
