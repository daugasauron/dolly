# Compile and benchmark the upstream GPU fluid simulation inside Dolly

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: gpu,experiment

Build a separate gpu-fluid image in work/gpu-shaders. Preserve existing recipes
and snapshots. Compile samdauwe/webgpu-native-examples fluid_simulation.c at
9a7c30753d6f44630564a8316eb9c44211ff0ecc inside the Wasm userspace, retaining its
solver and WGSL. Replace its window/ImGui integration with Dolly input and an
interactive GPU-rendered control panel.

The source requires more than four buffer bindings, per-vertex input and many
ordered dispatches. Extend the canonical GPU wire contract deliberately, preserve
browser resource quotas and add optional GPU timing with bounded query resources.

Done when real browser rendering, mouse input, settings, pause, reset, shell
recovery and compute output are verified; collect reproducible GPU and wall-clock
measurements on NVIDIA and compare with the same workload outside Dolly. Record
source hashes, compilation evidence, image preservation and limitations here.

Implementation: `Dollyfile-gpu-fluid`, prepared by
`scripts/prepare-gpu-fluid.mjs`, inherits the cached system image. Dolly's `cc
-std=gnu11 -O2` compiles the original C file through a local platform/entry wrapper
and scoped WebGPU C adapter. Source SHA-256:
`74d7a9fa5b0c23988016589cf57554028c38a1cd49916d03d9aeead85a045c40`.
The official webgpu.h and twelve cglm headers are pinned recipe downloads; raw
files replace the unavailable archive endpoint. Upstream licenses are installed.
No upstream solver or WGSL edits, native compilation, or CPU rendering fallback.
The final snapshot is 155056420 bytes, SHA-256
`25f0d6b206b559a9e74eba200d04ee3bacaafe8131fed982d170ec899b7a9d4c`.
The final cached rebuild reused eight ancestors and built only fluid in 5.3 s.

The actual solver needs fourteen bindings; the wire limit is now sixteen.
New bounded vertex-layout/draw records and INFO remain behind the existing GPU
import. Consecutive dispatches share a compute pass. Optional per-pass timestamp
queries have three fixed slots; normal rendering reads back no pixel buffers.
The new C panel controls size, grid, pressure, ink/volumetric smoke/shadows, pause,
reset and automatic stirring. GPU presentation dimensions now scale pointer
coordinates correctly after resizing independently of the CPU framebuffer.

Verified `node test/fluid-browser.mjs` on the actual X11 desktop:
Chrome 151.0.7922.71 reports `nvidia blackwell` (RTX 5070); Firefox 155.0 renders
but redacts adapter information. Both pass visible mode changes, stable pause,
manual input, 1080p resize, grid change, increased solver dispatch counts after
pressure adjustment, reset, normal exit, and two Ctrl-C/immediate reopen cycles.
Dolly readback and the direct replay both produce 271431 nonzero dye values with
sum 194882.001529972. Interactive rendering reports zero readback bytes.

Mean milliseconds per step, 20 warmups followed by 120 steps, pressure=20.
Grid is solver height; width follows the 16:9 aspect ratio. GPU times sum pass
execution only, excluding inter-pass copies, CPU and transport. Timing collection
is enabled in both paths. Request recording is disabled for Dolly measurements.

| Browser | Mode / grid / output | Dolly wall | Replay wall | Dolly GPU | Replay GPU |
| --- | --- | ---: | ---: | ---: | ---: |
| Chrome | ink / 128 / 720p | 1.057 | 0.944 | 0.155 | 0.155 |
| Chrome | ink / 256 / 720p | 1.050 | 0.970 | 0.252 | 0.253 |
| Chrome | ink / 512 / 1080p | 1.098 | 1.033 | 0.519 | 0.520 |
| Chrome | shaded / 512 / 1080p | 1.395 | 1.403 | 0.786 | 0.788 |
| Firefox | ink / 128 / 720p | 1.753 | 0.915 | 0.151 | 0.151 |
| Firefox | ink / 256 / 720p | 1.674 | 1.759 | 0.250 | 0.253 |
| Firefox | ink / 512 / 1080p | 1.673 | 3.396 | 0.504 | 0.514 |
| Firefox | shaded / 512 / 1080p | 4.168 | 4.169 | 0.773 | 0.775 |

Replay executes captured shaders/data/dispatches in a direct browser worker with
validation scopes, queue backpressure, and a DOM-linked OffscreenCanvas. It
omits the C program, process/kernel transport and admission checks; this is not
a native C baseline or isolated ABI overhead measurement. Chrome ink differences
were 0.065–0.113 ms/step in this run. The shaded difference is within run noise.
Firefox wall timings vary strongly with browser scheduling (including negative
Dolly-minus-replay differences); they do not establish an overhead percentage.
GPU execution times remain close. Full measurements and screenshots:
`build/fluid-proof/results.json`, `build/fluid-proof/*-{ink,smoke,shaded,reset}.png`.

Preservation check: all 72 entries in `build/gpu-original-images.json` still
match. The original gpu-demo snapshot also retains SHA-256
`c129e936083ba4fd3ecd87a13856e9b26316a13d8baec77e36558c7e1bb89439`.
Main/core-iteration code was not modified. Local preview:
`http://127.0.0.1:9094/gpu-fluid/`; the existing 9093 shader preview is retained.

Final verification on the retained-source image: launched the 9094 preview,
checked the original source hash with its own sha256sum, recompiled using its
own cc into `/workspace/fluid-rebuilt`, and ran the new executable's compute
check successfully. The shipped and freshly compiled executables both hash to
`a6052c1163220806f9d1f8db66fd9ae8f53d52e980a2197dbb1038240e1e53d1`.
Transcript: `build/fluid-proof/provenance.txt`. Sources and licenses are explicit
retained folder exports; the published image can reproduce its executable.

Regression checks also passed: `node test/gpu-browser.mjs` on Chrome/Firefox
(including malformed vertex input, excessive bindings, INFO, copied packets,
resource limits, closed scopes and three interruption/restart cycles each),
`DOLLY_IMAGE=system DOLLY_BROWSER_MODE=boundary bash scripts/test-browser.sh`
(29 exact outer imports and browser network policy checks), and all 17 tests in
`test/process-abi.test.mjs` and `test/site-release.test.mjs`.
Implementation branch: `codex/gpu-shaders-20260914`.
