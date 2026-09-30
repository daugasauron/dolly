# Seed contents invalidate every image on small edits

- STATUS: OPEN
- PRIORITY: 180
- TAGS: iteration,build,core

The image build ID hashes `dolly.data` (`scripts/write-build-id.mjs:8-21`), which contains
`slop.c`, `dollyfile.c`, `mkdir.c`, `rm.c`, the cc/ld/ar wrappers and every `include/dolly/*.h`
(`toolchain/CMakeLists.txt:87-121`). Editing any of them marks all 40 images stale ("seed or
image ABI changed", `scripts/build-system-snapshot.mjs:106`); a full rebuild takes about 2 h
(Codex 69 min, CMake 20 min, measured 2026-09-30 `images-build.log`). `system` copies rg and fd
(`Dollyfile-system:20-27`), putting the Rust chain under 27 images including `default` (core
chain 2.6 min without Rust, about 7 min with it).

## Evidence

Established: CONFIRMED BY READING. Timings from the Sep 30 integration build log.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

The core image chain does not depend on the Rust toolchain; seed edits invalidate only what they
must.

## Done when

- `default` rebuilds without rust-sdk/ripgrep/fd; measured core-chain rebuild time recorded.
