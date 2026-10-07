# Rust

An experimental Rust toolchain: an externally built compiler seed plus Patti, a C
build tool that compiles locked Cargo projects inside Dolly. ripgrep, fd and Protox
are built from source with it.

## Images

- `rust-sdk`: Rust compiler, standard library and procedural macros.
- `rust-build`: Rust SDK and Patti for compiling tools.
- `rust-tools`: Interactive Rust compiler and Patti build shell: `system` with the `rust` package.
- `rust`: the Rust SDK and Patti, as a package.
- `ripgrep`: rg built with Patti, as a package.
- `fd`: fd built with Patti, as a package.
- `protox`: the protobuf compiler Codex builds with, as a package.
- `cargo`: upstream Cargo built with Patti, with the `rust` package, as a package.
- `cbindgen`: the cbindgen header generator built with Patti, as a package (SpiderMonkey's configure requires it).

Build the seed once with `./demos/rust/build-rust-toolchain.sh` (Linux x86_64, Podman, Python
3.12+, curl, patch), then `npm run image -- rust-tools`. `rust-sdk` starts from
`system-build`; the `pi-coding-agent` and `codex-cli` packages install `ripgrep` and `fd`.

## Compiler seed

Rust 1.98.1 with LLVM 22.1.8 is a bootstrap exception: built outside Dolly by
[`build-rust-toolchain.sh`](build-rust-toolchain.sh) from
[`toolchain/bootstrap-sources.json`](toolchain/bootstrap-sources.json) and the
patches beside it, then validated against `dolly-process-0`. Image preparation
only stages a verified seed ([`Dollyfile-rust-sdk`](Dollyfile-rust-sdk)); it never builds one.

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
- `--config` takes Cargo's `[target.TRIPLE.LINKS]` table too: its values stand
  in for the build script of the package that links `LINKS`, so a `-sys` crate
  uses a library the image provides.
- `-j N` runs up to N compiler or build-script processes at once; a crate starts
  once everything it depends on is built. Each command's messages print as one
  block when it exits, and outputs and the record match a serial build.
- Source: [`patti.c`](patti.c); tests in [`test/`](test/).

## Cargo

Upstream Cargo 0.99.0, the Cargo of Rust 1.98.1, built by Patti from Cargo's
own lock ([`Dollyfile-cargo`](Dollyfile-cargo)). `amy install cargo` brings it
with the compiler and the C toolchain rustc links with.

- `cargo build`, `cargo rustc` and `cargo metadata` work with path and
  vendored dependencies, build scripts and procedural macros.
- crates.io: crate archives come through the HTTP broker. Its index sends CORS
  headers only for files its cache does not hold, so a page needs a relay for
  `index.crates.io` ([HTTP](../../docs/http.md#cors-and-relays)) or the
  project a vendored directory.
- A crate that uses `libc` needs the SDK's copy, because crates.io's has
  wasm32 layouts for this target: `[patch.crates-io] libc = { path =
  "/opt/rust-sdk/src/libc" }` in the project's `.cargo/config.toml`.
- No incremental builds until Dolly has file locks: the package sets
  `CARGO_INCREMENTAL=0`, which a session that installs it with amy sees from
  its next load. No `cargo test` (the SDK has no `test` crate), `cargo
  search`, `publish` or `login`, and no git dependencies.
- Its sources are upstream's with target patches only: Cargo's manifest
  without TLS, SSH and HTTP/2 features (`cargo-features`, `git2-curl`), and
  `is_executable`, `jobserver-in-process`, `socket2`, `zlib-rs` and
  `jiff-timezone` ([`config/patches/`](config/patches/),
  [`cargo-patti.toml`](config/cargo-patti.toml)). Building it needs about 6 GB.
- Findings and measurements: [task](../../tasks/20260930-231102-cargo-native/TASK.md).

## Limits

- Patti: panic-abort compilation; no incremental builds, file locks, dynamic
  Rust libraries, tests or benchmarks.
- Executables link threaded (`cc -pthread`) and need `REQUIRES HOST threads@0`.
- Git dependencies need an explicit `--patch`. Target patches live in
  [`config/patches/`](config/patches/).

Test: `npm run test:demos -- rust` ([`test/`](test/)).
