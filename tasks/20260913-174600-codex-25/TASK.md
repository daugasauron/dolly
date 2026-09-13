# Keep external Rust compiler bootstrapping out of ordinary image preparation

- STATUS: OPEN
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
