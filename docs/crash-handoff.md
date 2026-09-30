# Slopyard / main checkpoint — September 30

Local main contains merge `1f0995d` and verified code through `136f1e2`.
The main worktree is `/home/daug/dev/dolly/work/0ad-baseline`; build artifacts
and evidence remain in `/home/daug/dev/dolly/work/gpu-shaders` on
`codex/slopyard-main-integration-20260930`. No push or external deployment
occurred during this integration. Leave the root worktree and previews alone.

The clean Slopyard rename, live compiler output, bundled process Worker,
retired-image removal, minimal Dollyfile v4 host requirements and 0 A.D. audio
are complete. All 40 images validate against the combined runtime and current
recipes. There are no pending integration checks or execution blockers.

The closed [integration task](../tasks/20260930-002-slopyard-main-integration/TASK.md)
and [audio task](../tasks/20260930-001-v4-audio/TASK.md) record the evidence:
287 source tests, 27 artifact checks, real browser workflows and both complete
publication packages. Core/thread creation makes zero HTTP requests after boot.
Chromium and Firefox verify GPU rendering, fluid, bundled LLM inference, audio,
0 A.D. and recovered Slopyard data. Studio verifies live compiler output,
cancellation and opening the rebuilt image.

Accepted packages are under `build/slopyard-integration-20260930/`:
`domain-pages.tar.gz` and `github-pages.tar.gz`, with immutable sites behind
`{domain,github}-releases/current`. Both record source commit `136f1e2`.
The domain contains 40 images; GitHub contains 30 and is below 1 GB, with
domain links for Pi Local, Studio and 0 A.D. All 1,403 local routes are restored.

## Preserved data

`build/slopyard-migration-20260930/` is private, ignored and must not be published.
It contains six hash-verified original saves and separate converted files in
`converted/`. Both browsers import and re-export the current Lua world
(157 characters, 110 designs, saved programs intact) and 37-block blueprint.
Original files remain unchanged. Older world/agent history is archived separately;
browser-only changes are not captured. No old-name reader or redirect was added.

Preserve `build/checkpoint-slopyard-20260928/` and the September 27 backup.
The September 28 snapshot hash is
`4d0361638996184f75c689952b88850d2d70fb433fcfcebe3ca8a06a37af2f4f`;
its source archive hash is
`cac8bb61fa96a7e41bd53f994d9df68d66eade0e659e14ec45186af6ba6fe92c`.
These historical artifacts are not current build outputs.

The preparation/removal scripts beside
`build/slopyard-integration-20260930/main-preparation.json` were one-time merge
operations. Do not rerun them over the integrated tree.
