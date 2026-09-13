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

## Progress (2026-09-14 JST)

Source preparation now invokes Zig and font preparation only when the selected
closure includes those modules. The static staging tree shares unchanged file
inodes, while selected copies replace their destinations and archive writers
publish by rename. A failure leaves the previous tree intact; existing symlink
leaves are replaced instead of written through.

A real `DOLLY_BUILD_IMAGES=system-build` preparation took 17.26 s cold (GNU Make
configuration) and 0.83 s warm. All 82 declared HOST inputs were verified against
their pins. The libc++ and Make archives retained exactly the previous hashes.
No Rust, Zig or display preparation ran for this headless compiler base.

Unchanged selected archives are still reconstructed. Measure the larger source
preparers and a leaf edit before adding an archive cache; this small closure's
measured warm preparation does not justify a new cache layer by itself.

Runtime compilation and image preparation are now separate commands.
`build:runtime` builds the kernel/compiler seed; it does not prepare image
archives, generate image routes or prune snapshots. `snapshot` uses the existing
image command for the environment-selected catalog. Explicit image, plan, local
package and reproducibility options share that one path; full `build` runs both.

The actual official runtime build took 101.96 s with the pinned container, using
an owned wrapper solely to mount this worktree's existing external caches read
only. It produced exactly the previous runtime and image identities. All 188
recorded image/source digests stayed unchanged, and the 18-image reuse plan took
3.4 s. No image-source preparation or browser build ran during the runtime build.

The environment-selected `snapshot:reproducible` path for `system-build` took
47.0 s: source preparation 0.8 s, routes 0.1 s, two cold browser builds plus one
cached build 46.1 s. All three 123,123,028-byte snapshots had SHA-256
`0d857cbd26d44d4fcad18c59cbaf8efc8ec8896b7fbe918ee22552dd54518a1a`.
Larger unchanged archives and leaf source preparation remain open work.

The unchanged rebuilt runtime also passed the complete core gate in Chrome
(21.8 s) and Firefox (28.3 s), using the existing default image and tools.
