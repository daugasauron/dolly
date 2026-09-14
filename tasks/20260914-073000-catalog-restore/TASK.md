# Preserve the complete deployed image catalog and rebuild links

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: images,bug,checkpoint

The checkpoint at localhost:9098 was packaged with a restricted selection of
21 images. The deployed [daugasauron.com](https://daugasauron.com/) release
`cc12357d`, source `ff633f7`, has 32. All original recipes remained in this
branch. Build-only menu rows had also replaced the explicit rebuild link.

The full catalog now has all 32 deployed images, the six compiler/library bases
and fluid. Every row has open/rebuild/Dollyfile links; compiler bases appear
below the build heading. The shader playground is removed. Package with
`DOLLY_BUILD_IMAGES=all` and the `daugasauron.com` variant to retain Agents at
play. Main remains unmerged.

## Verification

Chrome 151 checked all 117 image links, started and cancelled a Rust builder
through the restored rebuild link, and confirmed the old demo route returns
404. Chrome and Firefox passed fluid rendering, controls, compute readback,
interrupt/restart and all ten shared GPU boundary cases. All 274 source tests,
39 recipe pins and 247 HOST sources pass. [Structured evidence](evidence.json).

Sixteen stale artifacts were rebuilt inside Dolly; the final plan reuses all
39 images with valid inputs and digests. Codex took 4,472.1 seconds (74.5 minutes);
its old artifact predated the overnight seed changes. No Codex source or build
configuration changed for this repair. Fluid, Pi-local and Studio keep their
verified checkpoint snapshot hashes.

Local logs: `build/full-catalog-build.log`, `build/catalog-final-plan.log`,
`build/catalog-browser.json`, `build/catalog-restored.png`, and
`build/fluid-proof/results.json`.

All 39 packaged image inventories passed. Published local release `12b9aaf4`
from source `b0f02f0`, tagged `gpu-checkpoint-full-20260914`. The published
menu passed the same 117-link and rebuild start/cancel check. Agents at play
is present, and all three retired demo routes plus its recipe, module and
snapshot metadata return 404 in the current release. Refresh
[the local preview](http://127.0.0.1:9098/). The original 21-image release is
retained as an immutable historical artifact; it is no longer current.
