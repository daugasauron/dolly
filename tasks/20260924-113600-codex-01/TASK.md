# Reduce the game's per-frame GPU submission wait

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: gpu,game,performance

Image 17's industrial world runs at 21–22 FPS in Chrome on Xvfb while physics
keeps real time. The renderer sends roughly 3.4 command packets per frame. In-Dolly clocks
measure about 17.5 ms per render, including 16.1 ms submitting the draw; the GPU
provider reports 16.8 ms total batch wall time per frame. Actual GPU timestamp
queries average only 0.296 ms. CPU tree building is 0.681 ms and buffer upload
0.652 ms. Evidence: `build/blockwalker-frame-profile-timings.log`, actual NVIDIA
Blackwell/Chrome execution under a 4 GiB/no-swap process-tree limit.

Separate per-frame broker/browser waiting from useful GPU work. Preserve exact
packet validation, capability limits, error reporting and command order. Do not
remove validation or lower physics/render quality to improve the number. Use
source overrides for experiments before changing the provider. Completion needs
real-browser behavior and GPU boundary checks, plus an actual game measurement
with the same world/camera. No new host capability or ABI change is intended.

Popping both error scopes before awaiting either retains the same error results
and precedence. The source-override trial measured 55.09 FPS with the same world
and camera, 0.694 ms draw submission, 3.69 ms total batch wall time and 0.297 ms
actual GPU work. `build/blockwalker-frame-profile-parallel-errors.log`.

The actual X11 desktop already ran the original provider at 60.09 / 61.11 FPS
(Quay/focus); the revised provider measures 60.42 / 61.03 FPS. Thus the measured
speedup applies to the virtual-display test environment, not normal desktop
play. Logs: `build/blockwalker-competition-preview-desktop-{original,current}.log`.
Both checks retain all original objects, advance simulation in real time, make
no model requests and read back no GPU pixels.

Real Chrome and desktop Firefox passed the upstream fluid controls, solver
readback versus identical direct-browser commands, rendering at 720p/1080p,
two interrupt/restarts and GPU boundary checks. The new boundary case exercises
actual WebGPU errors (MAP_READ combined with STORAGE), repeats the failure, then
successfully allocates a valid resource. Existing capability, ownership, bounds,
quota, stale-handle and captured-color checks pass. Evidence:
`build/blockwalker-fluid-errors-proof/results.json` (Chrome 151) and
`build/blockwalker-fluid-firefox-desktop-proof/results.json` (Firefox 155).
The fluid source was compiled inside the existing game image; no compiler-base
or image rebuild was needed. Test PNG comparisons now use bounded boolean buffer
comparisons to avoid Node's unsafe huge failed-diff allocation.

Firefox's Xvfb run provided no GPU adapter, matching the previously documented
virtual-display limitation; actual desktop rendering passed. This does not
establish a Firefox/Xvfb fix. The actual Firefox game also passed, measuring
56.57 / 58.05 FPS at Quay/focus, with real-time simulation, zero removals and no
browser errors. Both views were visually inspected. Evidence:
`build/blockwalker-competition-preview-desktop-firefox.log` and its screenshots.
The production change is one line in `src/gpu-worker.mjs`; ABI, capabilities,
image bytes, quality and physics are unchanged.
