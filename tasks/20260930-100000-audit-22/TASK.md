# GPU interface grants page-level WGSL and compute authority

- STATUS: OPEN
- PRIORITY: 160
- TAGS: security,boundary,demo

Wasm can compile arbitrary WGSL and run compute bounded only by the browser watchdog (device
loss handled at `src/gpu-worker.mjs:70-75`). Shader modules, pipelines, bind groups and
timestamp buffers are not counted in the byte quota; adapter vendor/description is returned to
Wasm (`:615-617`, fingerprintable). `docs/browser-boundary.md:185` says 4,096 objects across the
provider; code enforces 4,096 per lease (32,768 total; `docs/gpu.md:39` is right). Only Pi
Local's compute path and the games/fluid render path use it.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

The GPU capability's authority is stated precisely and every object kind is counted; the owner
decides whether the render path stays in the runtime.

## Done when

- Docs corrected; object quotas cover modules/pipelines/bind groups; adapter info is reduced.
