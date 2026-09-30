# Build the Rust compiler inside the userspace

- STATUS: OPEN
- PRIORITY: 220
- TAGS: toolchain,bootstrap,rust

Owner goal: rustc must be compiled inside Dolly, not cross-built on the host. Today the Rust seed (rustc 1.98.1 against a separate LLVM 22) is built by scripts/build-rust-toolchain.sh on the host (demos/rust/README.md).

A self-hosted build needs a stage0 compiler (the seed may serve once), LLVM compiled inside Dolly, and rustc's own build driven by in-sandbox tools. Measure LLVM's in-sandbox build cost first.

Done when: an image builds rustc from pinned sources inside Dolly and later Rust images use it, with the host seed reduced to an explicit, documented stage0 or removed.
