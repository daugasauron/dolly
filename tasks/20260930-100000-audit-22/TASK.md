# GPU interface grants page-level WGSL and compute authority

- STATUS: CLOSED
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

## Closed (2026-10-05, big-picture review)

Checked against the done-when on `integrate/1005`: every object-creating
operation (buffers, shaders, the four pipeline kinds, bind and resource
groups, textures, samplers) counts against 4,096 objects per scope
(`host/gpu/worker.mjs:286`), buffers and textures against 4 GiB (`:289`,
`:381`); the guest receives a fixed adapter name (`:617`); the boundary table
states "4,096 objects each" (`docs/browser-boundary.md:57`). `AGENTS.md` now
lists GPU buffers and textures as explicit external resources, which is the
owner's decision the audit asked for.
