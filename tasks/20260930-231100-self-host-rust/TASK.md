# Build the Rust compiler inside the userspace

- STATUS: OPEN
- PRIORITY: 250
- TAGS: toolchain,bootstrap,rust

Owner goal: rustc must be compiled inside Dolly, not cross-built on the host. Today the Rust seed (rustc 1.98.1 against a separate LLVM 22) is built by scripts/build-rust-toolchain.sh on the host (demos/rust/README.md).

A self-hosted build needs a stage0 compiler (the seed may serve once), LLVM compiled inside Dolly, and rustc's own build driven by in-sandbox tools. Measure LLVM's in-sandbox build cost first.

Done when: an image builds rustc from pinned sources inside Dolly and later Rust images use it, with the host seed reduced to an explicit, documented stage0 or removed.

## Review note (2026-10-05, big-picture review)

`20260930-100000-audit-46` is closed into this task. Still present on
`integrate/1005`: `RUSTC_BOOTSTRAP=1` for every crate (`demos/rust/rustc.sh`),
two near-identical libc patches (`demos/rust/toolchain/libc-0.2.185.patch`,
`libc-0.2.186.patch`) and seven inline string replacements in
`demos/codex/prepare-codex-sources.py`. Settle them when the seed is rebuilt
or retired here.

## Reproducibility gap: rust-sdk.tar.gz depends on its build tree (2026-10-07)

`build-rust-toolchain.sh` is deterministic within a tree (packing the seed
twice gave the same SHA, a9d68920…), but the bytes depend on the external
`build/rustc-port` the seed was built from: the Cargo track's tree and the
round-3 candidate's tree produce different `rust-sdk.tar.gz` for the same
in-tree inputs (the image-inputs hash matched c62b2710… while the tarball
SHAs differed, a9d68920… vs round 3's f4393cf6…, which `Dollyfile-rust-sdk`
pins). So a tree importing round 3's images must also take round 3's
`rust-sdk.tar.gz` and `build/rustc-port/seed.sha256`, not rebuild its own.
The external toolchain (the stage0 rustc and its LLVM) is not covered by the
image-inputs hash; a self-hosted rustc would close this gap by making the
seed's provenance in-tree.
