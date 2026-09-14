# Investigate Firefox WebGPU canvas presentation on Linux

- STATUS: OPEN
- PRIORITY: 100
- TAGS: gpu,browser

The GPU prototype on `codex/gpu-shaders-20260914` renders correctly in Chrome
151 with the AMD RDNA2 adapter. Installed Firefox 155.0.1 admits WebGPU, executes
all demo command batches and returns correct GPU compute readback, but its
canvas is blank in both BiDi screenshots and an X11 desktop capture. Reproduced
with both headless Firefox and Firefox under Xvfb, each in a fresh profile with
only `dom.webgpu.enabled` opted in.

A direct main-thread WebGPU green clear and a red clear through a single Worker
canvas transfer, added by test JavaScript on the same page, also fail to appear.
Those controls bypass the Dolly ABI. This narrows the investigation but does
not establish the root cause or prove failure on other Firefox installations.
Playwright's bundled Firefox 155.0 instead rejects adapter acquisition through
its blocklist, even with the tested override; Dolly recovers to its shell.

Check Firefox canvas/compositor configuration and adapter selection, then repeat
on a minimal standalone page and with a working NVIDIA driver installation.
The machine currently reports kernel driver 580.173.02 / NVML 580.178 mismatch;
its relationship to this Firefox presentation failure is unproven. Do not fix
this by introducing an implicit CPU readback/presentation fallback.

Done when actual Firefox-visible pixels, scene changes and compute-to-render
are verified with the direct GPU presentation path. Evidence from this run is
in `work/gpu-shaders/build/gpu-proof/firefox-*`; the working Chrome comparisons
and source implementation are described in gpu-03.
