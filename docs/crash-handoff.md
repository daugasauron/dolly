# Slopyard / main integration — September 30

Current worktree: `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/slopyard-main-integration-20260930`.
The working tree contains an uncommitted source integration, not a tested release.
HEAD is `2e7d93da305651e1a312c6bdaf3c5c1a625aea5d`; integrated main is
`e3ba5fb5704785bae9fa2f6610ac2fa5e1f716f2`.
Leave the root worktree and running previews alone.

Status and required evidence live in
[tasks/20260930-002-slopyard-main-integration/TASK.md](../tasks/20260930-002-slopyard-main-integration/TASK.md)
and [the audio task](../tasks/20260930-001-v4-audio/TASK.md).
The clean rename, retired-image removal, live build output, bundled process
worker and minimal v4 host declarations are prepared. Main's 0 A.D., audio, GPU
and streaming snapshots are integrated in source. The combined runtime builds
and passes its exact browser-import and kernel ABI checks. The 40-image browser
rebuild is in progress, logged in `build/slopyard-integration-20260930/images-build.log`.
The system/compiler bases, CMake, SDL2, Bhop and Pi Runtime have rebuilt.
No real Git merge, commit, push or deployment has occurred here.

All 287 source tests pass. Real Chromium checks pass for streaming build-log
text/bounds and standalone compiler rebuild output, cancellation and retry.
Chromium and Firefox pass core/thread creation with HTTP blocked (zero requests),
audio playback, 0 A.D. rendering/audio/gameplay/save-load, Slopyard save imports,
hardware GPU rendering and fluid compute/control/recovery checks. Evidence is in
`build/slopyard-integration-20260930/`. Studio rebuild output and final packaged
image inventories remain pending.
All 40 images lint, all 384
HOST sources verify, and 1,403 routes regenerate. Route generation clears only
its own generated output. The new worker bundle has no external imports.

## Preserved data

`build/slopyard-migration-20260930/` is private, ignored and must not be published.
It contains six hash-verified original recovered saves and separate renamed
copies of the September 28 Lua world and working blueprint. The Lua world parses
as Slopyard world v6 with 157 characters and 110 designs. Both browsers import
that world with its programs intact and the 37-block blueprint, and re-export
current formats. The original backup files remain unchanged. The older JSON world and agent history remain
untouched for separate migration; browser-only changes are not captured here.
No runtime old-name compatibility reader or redirect was added.

The last verified pre-integration checkpoint is preserved in
`build/checkpoint-slopyard-20260928/`, including its original detailed handoff,
world, source archive and snapshot. Do not overwrite this checkpoint or the
older September 27 backup. The September 28 snapshot hash is
`4d0361638996184f75c689952b88850d2d70fb433fcfcebe3ca8a06a37af2f4f`.
Its source tar hash is
`cac8bb61fa96a7e41bd53f994d9df68d66eade0e659e14ec45186af6ba6fe92c`.
These historical artifacts are not current Slopyard build outputs.

## Resume

Execution permissions are restored. The combined runtime build completed on
September 30; its log is `build/slopyard-integration-20260930/runtime-build.log`.
Native parser and retention fixtures now execute successfully. Continue the
normal in-browser image build. The running planner cached Slopyard's recipe
before its import fix; replan normally if that identity check fails. The fixed
Slopyard image was separately rebuilt and verified. Do not bypass staleness or
capability checks to obtain a green result.

Rebuild output still needs the full Studio check:
`DOLLY_IMAGE=dollyfile-studio DOLLY_BROWSER_MODE=image-build ./scripts/test-browser.sh`
The standalone `DOLLY_IMAGE=system-build DOLLY_BROWSER_MODE=build-page` mode passes.
Verify full publication catalogs before merging main.

`build/slopyard-integration-20260930/main-preparation.json` records the source
merge base and resolved files. Its adjacent preparation/removal scripts were
one-time operations; rerunning them would overwrite subsequent edits.
