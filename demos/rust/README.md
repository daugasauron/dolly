# Rust

An experimental Rust toolchain: an externally built compiler seed plus Patti, a C
build tool that compiles locked Cargo projects inside Dolly. ripgrep, fd and Protox
are built from source with it.

## Images

- `rust-sdk`: Rust compiler, standard library and procedural macros.
- `rust-build`: Rust SDK and Patti for compiling tools.
- `rust-tools`: Interactive Rust compiler and Patti build shell.
- `ripgrep`: Build ripgrep with Patti and retain rg.
- `fd-build`: Build fd with Patti and retain fd.
- `protox-build`: Source-built protobuf compiler for Codex.

Build the seed once with `./demos/rust/build-rust-toolchain.sh` (Linux x86_64, Podman, Python
3.12+, curl, patch), then `npm run image -- rust-tools`. `rust-sdk` starts from
`system-build`; [`search-tools.dm`](search-tools.dm) copies `rg` and `fd` into Pi
and Codex images.

## Compiler seed

Rust 1.98.1 with LLVM 22.1.8 is a bootstrap exception: built outside Dolly by
[`build-rust-toolchain.sh`](build-rust-toolchain.sh) from
[`toolchain/bootstrap-sources.json`](toolchain/bootstrap-sources.json) and the
patches beside it, then validated against `dolly-process-0`. Image preparation
only stages a verified seed ([`rust-sdk.dm`](rust-sdk.dm)); it never builds one.

## Patti

```sh
patti fetch --manifest-path project/Cargo.toml
patti build -j 4 --offline --manifest-path project/Cargo.toml --bin program
```

- Needs an existing `Cargo.lock`; downloads exact crates from
  `static.crates.io` through the broker and verifies their SHA-256
  (`--registry` selects a mirror). Cache: `~/.cache/patti`.
- Supports workspaces, path and registry dependencies, features, target cfgs,
  build scripts and procedural macros run in Dolly, `--patch`, `--config` and a
  fingerprinted `--resume`. Output and a build record go to `target/patti`.
- `-j N` runs up to N compiler or build-script processes at once; a crate starts
  once everything it depends on is built. Each command's messages print as one
  block when it exits, and outputs and the record match a serial build.
- Source: [`patti.c`](patti.c); tests in [`test/`](test/).

## Limits

- Panic-abort compilation; no Cargo, incremental builds, file locks,
  application threads, dynamic Rust libraries, tests or benchmarks.
- Git dependencies need an explicit `--patch`. Target patches live in
  [`config/patches/`](config/patches/).

Test: `npm run test:demos -- rust` ([`test/`](test/)).
