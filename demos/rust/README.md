# Rust

Rust built inside Dolly: `rustc`, its standard library and Cargo are compiled
from their pinned sources by an externally built seed, and everything else
Rust in the catalog is built by the result with Cargo.

## Images

- `rust-sdk`: the seed, staged: its compiler and standard library, and its Cargo linked here.
- `rust-llvm`: the LLVM 22 libraries rustc links, built by Dolly's `c++`.
- `rust-build`: rustc, the standard library and Cargo built by the seed; the base of every Rust build.
- `rust-tools`: interactive shell: `system` with the `rust` and `cargo` packages.
- `rust`: the SDK that `rust-build` built, as a package.
- `cargo`: the Cargo that `rust-build` built, with the `rust` package, as a package.
- `ripgrep`: rg, as a package.
- `fd`: fd, as a package.
- `protox`: the protobuf compiler Codex builds with, as a package.
- `cbindgen`: the header generator SpiderMonkey's configure requires, as a package.

Build the seed once with `./demos/rust/build-rust-toolchain.sh` (Linux x86_64, Podman, Python
3.12+, curl, patch), then `npm run image -- rust-tools`. `rust-sdk` starts from
`system-build`; the `pi-coding-agent` and `codex-cli` packages install `ripgrep` and `fd`.

## The seed

Rust 1.98.1 with LLVM 22.1.8 is a bootstrap exception: built outside Dolly by
[`build-rust-toolchain.sh`](build-rust-toolchain.sh) from
[`toolchain/bootstrap-sources.json`](toolchain/bootstrap-sources.json) and the
patches beside it, then validated against `dolly-process-0`. It holds `rustc`
linked, the standard library, and Cargo cross-compiled up to one object that
[`Dollyfile-rust-sdk`](Dollyfile-rust-sdk) links against Dolly's libc, libcurl
and zlib. Image preparation only stages a verified seed; it never builds one.
Nothing of the seed is in the `rust` or `cargo` package.

## Built inside Dolly

[`Dollyfile-rust-build`](Dollyfile-rust-build) runs Cargo three times: the
compiler's 251 crates against `rust-llvm`'s libraries, the standard library
with that compiler (`-Z build-std`), then Cargo with both.

- The sources are the seed's: the pinned Rust archive with the same patches,
  the `rust-src` component for the standard library, and each locked crate
  extracted as Cargo's directory source
  ([`prepare-rustc-sources.py`](prepare-rustc-sources.py)).
- Building the compiler again with the compiler built here gives the same
  bytes: of 264 files (the 251.3 MiB `rustc` and 263 libraries) none differs
  between the second and third generation, and the 22 libraries of the
  standard library are the same from either. Measured in one Chrome session,
  recorded in the [task](../../tasks/20260930-231100-self-host-rust/TASK.md).
- `rustc` is linked as a host of procedural-macro libraries (`cc -rdynamic`),
  so it has no threads; [`rust-linker.c`](rust-linker.c) adds the loader names
  Rust binds and what std in a loaded library imports.

## Sources for a Cargo build

[`prepare-rust-sources.py`](prepare-rust-sources.py) stages a project for an
offline build: upstream's archive, every crate its `Cargo.lock` names
(checksum-verified, extracted to `vendor/`), the target patches applied in
place, and a `.cargo/config.toml` that points Cargo at `vendor/` and sets the
profile the seed is built with. A recipe then runs `cargo build --offline`.

## Cargo

Upstream Cargo 0.99.0, the Cargo of Rust 1.98.1. `amy install cargo` brings it
with the compiler.

- `cargo build`, `cargo rustc` and `cargo metadata` work with path and
  vendored dependencies, build scripts and procedural macros.
- `cargo run` builds and then fails: Cargo replaces itself with the program
  (`exec`), which Dolly does not have. Run `target/debug/NAME`.
- crates.io: crate archives come through the HTTP broker. Its index sends CORS
  headers only for files its cache does not hold, so a page needs a relay for
  `index.crates.io` ([HTTP](../../docs/http.md#cors-and-relays)) or the
  project a vendored directory.
- A crate that uses `libc` needs the SDK's copy, because crates.io's has
  wasm32 layouts for this target: `[patch.crates-io] libc = { path =
  "/opt/rust-sdk/src/libc" }` in the project's `.cargo/config.toml`.
- A build script that compiles C needs `CRATE_CC_NO_DEFAULTS=1`, which the
  package sets: the `cc` crate's default flags name a target.
- No incremental builds (the package sets `CARGO_INCREMENTAL=0`) until Dolly
  has file locks; no `cargo search`, `publish` or `login`.
- Its sources are upstream's with target patches only: Cargo's manifest
  without TLS, SSH and HTTP/2 features (`cargo-features`, `git2-curl`), and
  `is_executable`, `jobserver-in-process`, `socket2`, `zlib-rs` and
  `jiff-timezone` ([`config/patches/`](config/patches/),
  [`cargo.toml`](config/cargo.toml)).
- Findings and measurements: [task](../../tasks/20260930-231102-cargo-native/TASK.md).

## Limits

- Programs are compiled with panics that abort; no dynamic Rust libraries.
- Executables link threaded (`cc -pthread`) and need `REQUIRES HOST threads@0`.
  The compiler loads proc macros and needs `dso@0`, which a build host enables
  and an image that keeps `rustc` declares.
- Target patches live in [`config/patches/`](config/patches/).

Test: `npm run test:demos -- rust` ([`test/`](test/)).
