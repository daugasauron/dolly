# Prepare only changed inputs for a selected image build

- STATUS: OPEN
- PRIORITY: 25
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

## Larger-source measurements

The official unchanged `npm run image -- cmake-build` path took 3.97 s and
4.13 s with verified cached upstream sources. Preparation/pinning took 3.4–3.6 s,
routes 0.1 s, and complete three-image reuse inspection 0.4 s. The 117 HOST
sources (41.4 MB) remained byte-identical; 37 unchanged files were republished.
CMake's source archive contains 30,267 files.

A temporary edit to the actual CMake platform input took 3.285 s to prepare,
0.091 s for routes and 0.230 s to plan. Only CMake required a rebuild; the two
headless bases were reused. Restoring the exact input and rebuilding its archive
restored full reuse of all 18 selected images. No compiler ran for this probe.

Ripgrep/fd source preparation with initially absent verified download caches took
4.32 s / 9.67 s. Warm runs took 0.11 s / 0.18 s and reproduced the exact existing
archive hashes. These scripts compile nothing; the separately bootstrapped Rust
compiler seed is still the existing ABI-validated pinned input in this worktree.

Remaining archive reuse is now lower priority: these measurements do not justify
adding another cache layer yet. The runtime/image separation and native link fix
removed the large measured iteration costs; frontend-only changes already run
without source preparation or image builds. Keep this issue open for further
optimization if larger selected workflows show a meaningful remaining cost.

The full default/Pi commands are now measured too: 5.10 s / 5.17 s with all image
artifacts reused and exact source validation retained. Source preparation is
3.2 s / 2.6 s. Issue 25 made Rust compiler bootstrapping explicit, so an absent
raw compiler build tree no longer forces that expensive operation before reuse.

## Archive writer measurement

A Studio skill edit rebuilt only the 9.4 s Studio leaf, but its broad first source
preparation took 27.2 s. Per-command profiling identified CMake's 30,267-file
archive as the largest warm writer (3.81 s in that profile); Neovim was 1.14 s.

The standalone archive writer now uses serial file I/O and one reusable 64 KiB
buffer, avoiding a promise and new buffer for each small file/header/padding
operation. Gzip still streams and publication remains atomic. No cache is added.
Interleaved repeated runs of the same CMake mapping produced the exact existing
13,227,684-byte archive in **1.138/1.139 s**, versus **2.133/2.092 s** before.
The official unchanged Studio command, interleaved in the same way, took
**7.857/7.858 s**, versus **10.617/10.299 s** before. All artifacts were reused.

All 123 staged source hashes remained identical. Existing tar/gzip regressions
still extract with native tar and exercise short writes, rejected symlinks and
failed staging. The short-write injection now proves it was actually reached.
All 286 source checks and 28 applicable artifact checks pass. Remaining caching
is lower priority; selected archives are still reconstructed and this issue does
not claim unchanged-input caching is complete.
