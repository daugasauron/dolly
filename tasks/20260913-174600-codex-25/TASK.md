# Keep external Rust compiler bootstrapping out of ordinary image preparation

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: audit,build,bootstrap

## Evidence

`prepare-image-sources.sh` invokes `build-rust-toolchain.sh` whenever the selected
closure contains rust-sdk. Default/Pi images inherit source-built rg/fd and thus
include that closure. If the raw native Rust build cache is absent or its input
key changes, even an application configuration edit can enter the full external
Rust/LLVM bootstrap before inspecting otherwise reusable image artifacts.

This worktree has an existing pinned, ABI-validated Rust seed and source-built
rg/fd artifacts, but no raw `build/rustc-port` tree. The compiler was deliberately
not rebuilt during the iteration audit; image tests used its recorded HOST input.
The new headless Pi producer can run the normal image command without that Rust
dependency (3.31 s for verified source preparation and complete cache reuse).

## Done when

- Make native Rust seed bootstrapping an explicit bootstrap operation.
- Ordinary image preparation stages a verified built or already pinned seed without unexpectedly compiling an external toolchain.
- Missing/incompatible seed inputs fail clearly before expensive work; changing the seed is explicit and preserves process ABI validation.
- Document clean bootstrap and seed refresh, measure a normal default/Pi image iteration, and retain source/provenance checks.

## Result

`npm run build:rust-seed` is now the explicit native bootstrap/refresh command.
Ordinary source preparation stages either the checksum-verified completed build
or the existing HOST artifact pinned by rust-sdk. Missing/corrupt input is checked
before upstream source preparation, and publication preserves the previous static
tree. The compiler's existing process ABI validation remains in place.

Actual missing/corrupt pinned seeds failed in 0.066 s / 0.067 s without creating
a Rust build tree. The old seed and static files were preserved. The staging
regression also checks a completed build, checksum-record failure and a symlink
destination without writing through to the borrowed cache.

The full official unchanged commands now work without a raw Rust compiler tree:
`npm run image -- default` took 5.10 s (3.2 s source preparation/pinning,
0.3 s routes, 1.5 s reuse of all nine images); `npm run image -- pi` took 5.17 s
(2.6 s preparation, 0.3 s routes, 2.1 s reuse of all 13 images). They verified
142 / 168 HOST inputs (267.1 / 313.6 MB). All 123 existing static files remained
byte-identical. The native Rust compiler was not rebuilt.

All 283 source checks pass in 2.79 s, all 28 selected artifact checks pass, and
the core ABI/process/filesystem/C/C++/rg/fd/interrupt/HTTP gate passed in Chrome
(20.8 s) and Firefox (27.1 s).
