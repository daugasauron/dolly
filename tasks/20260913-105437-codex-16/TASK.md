# Prepare only changed inputs for a selected image build

- STATUS: OPEN
- PRIORITY: 250
- TAGS: audit,build

## Evidence

At `ff633f7`, `npm run image -- IMAGE` already reuses the built runtime and selects
the image dependency closure. However [prepare-image-sources.sh](../../scripts/prepare-image-sources.sh)
runs all preparers in that closure before snapshot cache checks, copies the entire
existing dist/static into a replacement tree, and calls the archive writer again.
[build-source-tar.mjs](../../scripts/build-source-tar.mjs) rebuilds archives from input
bytes; it has no unchanged-input early return. update-module-pins --sources then
reads available sources across the whole catalog.

The existing dist/static contained 120 files / **1,059.43 MiB**. Copying it with the
same cp -R command into a disposable directory took **0.36 seconds** on this host:
copying alone is not the dominant measured cost here. Source archive reconstruction,
compression and preparer checks still need per-phase timings.

The Rust toolchain script already verifies and reuses a cached seed. Do not report
that every image command recompiles rustc.

## Done when

- Measure preparation, pinning, inspection and snapshot phases separately for an unchanged build and a leaf source edit.
- Reuse unchanged staged inputs/archives and prepare only the selected changed inputs; retain atomic publication and exact source validation.
- An application prompt or frontend-only edit must not reconstruct unrelated upstream archives.
- Keep the existing image command and explicit full-build/reproducibility path; add no generic orchestration layer.
