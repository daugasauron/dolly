# Rust

Rust built inside Dolly: `rustc`, its standard library and Cargo are compiled
from their pinned sources by the previous round's build of them, the seed, and
everything else Rust in the catalog is built by the result with Cargo.

## Images

- `rust-sdk`: the seed, staged: rustc, its standard library and Cargo as the previous round built them.
- `rust-llvm`: the LLVM 22 libraries rustc links, built by Dolly's `c++`.
- `rust-build`: rustc, the standard library and Cargo built from source, the kept rustc by the first one built here; the base of every Rust build.
- `rust-tools`: interactive shell: `system` with the `rust`, `cargo` and `transfer` packages.
- `rust`: `rustc`, `rustdoc` and the Rust standard library, built inside Dolly, with the `cc` package it links through.
- `cargo`: `cargo`, built inside Dolly, with the `rust` package it compiles with.
- `vendor-crates`: `vendor-crates`, which writes the crates.io crates a Cargo project depends on to `vendor/` for `cargo build --offline`: crates.io's index sends no CORS headers a page can use.
- `ripgrep`: `rg`, which searches files by regular expression.
- `fd`: `fd`, which finds files by name.
- `protox`: `protox`, a protobuf compiler; Codex is built with it.
- `cbindgen`: `cbindgen`, which writes C headers for Rust libraries; SpiderMonkey's configure requires it.
- `naga`: `naga`, the wgpu project's shader translator; 0 A.D.'s shaders are translated to WGSL with it.

`npm run image -- rust-tools` fetches the pinned seed from the GitHub release that carries it;
staging rust-build's sources takes Python 3.12+, curl and patch. `rust-sdk` starts from
`system-build`; the `pi` and `codex` packages install `ripgrep` and `fd`.

## The seed

The seed is Rust 1.98.1 as Dolly built it in the previous round: `rust-build`'s
rustc and standard library and the `cargo` package's Cargo, which
[`pin-seed.mjs`](pin-seed.mjs) archives and pins in
[`source-pins.sh`](source-pins.sh) (`DOLLY_RUST_SEED_*`), and the GitHub release
carries ([sources](../../docs/sources.md#the-rust-and-go-seeds)). A round pins
it after its images; a pin it leaves unchanged is the fixed point. `rust-sdk`
compiles its linker adapter itself. Rust is written in Rust, so the first
compiler came from outside: Rust 1.98.1 with LLVM 22.1.8, cross-built on Linux
in Podman by `build-rust-toolchain.sh` (last in commit `6a610431`). The 0.1.7
images it built gave the first seed built in Dolly; a bootstrap from nothing
starts there.

## Built inside Dolly

[`Dollyfile-rust-build`](Dollyfile-rust-build) builds two generations of the
compiler against `rust-llvm`'s libraries and keeps the second:

1. The seed's rustc compiles rustc's 251 crates. This first rustc links the
   seed's standard library, the previous round's.
2. The first rustc compiles the standard library (`-Z build-std`), which
   replaces the seed's.
3. The first rustc compiles rustc again, against that library, and rustdoc
   against that rustc's crates, into one executable that is both, as natively
   both link one `librustc_driver`. This second rustc is the one the `rust`
   package carries.
4. The second rustc compiles the standard library once more, and the build
   fails unless all 25 libraries are, byte for byte, those of step 2.
5. The second rustc compiles Cargo.

- So nothing of the seed is in the `rust` or `cargo` package: every Rust
  crate in them was compiled inside Dolly. Like every program here they link
  Dolly's libc, which is built with the kernel, outside.
- A third rustc is the second again: measured in a Chrome session, 264 files
  (the 251.3 MiB `rustc` and 263 libraries) were the same between the second
  and third generation ([task](../../tasks/20260930-231100-self-host-rust/TASK.md)),
  and with the recipe's own command on 2026-11-04, before rustdoc joined it. On
  2026-11-17 `rust-build` on the seed taken from 0.1.7's gave the seed's 392
  files and its Cargo, byte for byte
  ([task](../../tasks/20261116-142914-ports-07/TASK.md)). The recipe checks the
  standard library on every build; a round's pin of the seed checks the
  compiler and Cargo.
- The sources: the pinned Rust archive with its patches, the `rust-src`
  component for the standard library, and each locked crate extracted as
  Cargo's directory source ([`toolchain/prepare.sh`](toolchain/prepare.sh),
  [`prepare-rustc-sources.py`](prepare-rustc-sources.py)), with rustdoc's 44
  crates ([`rustdoc.lock`](config/rustdoc.lock)). The recipe applies one patch
  more: rustdoc finds its sysroot by its symlinked name
  ([`rustc-sysroot.patch`](config/patches/rustc-sysroot.patch)).
- `rustc` is linked as a host of procedural-macro libraries (`cc -rdynamic`),
  without threads: its frontend and code generation run on one thread
  ([`toolchain/rust.patch`](toolchain/rust.patch)), a choice for serial
  semantics, which Cargo's parallel `rustc` processes make up for;
  [`rust-linker.c`](rust-linker.c) adds the loader names Rust binds and what
  std in a loaded library imports.

## Sources for a Cargo build

[`prepare-rust-sources.py`](prepare-rust-sources.py) stages a project for an
offline build: upstream's archive, every crate its `Cargo.lock` names
(checksum-verified, extracted to `vendor/`), the target patches applied in
place, and a `.cargo/config.toml` that points Cargo at `vendor/` and sets the
profile the images are built with. A recipe then runs `cargo build --offline`.

## Cargo

Upstream Cargo 0.99.0, the Cargo of Rust 1.98.1. `amy install cargo` brings it
with the compiler.

- `cargo new`, `cargo build`, `cargo rustc` and `cargo metadata` work with path and
  vendored dependencies, build scripts and procedural macros.
- `cargo run` builds the program and replaces Cargo with it (`exec`).
- `cargo test` runs a crate's tests in the test program's process, with libtest's report and
  Cargo's status (101 when one fails), and a library's doc tests with `rustdoc`. rustdoc
  reports a failed doc test by unwinding and aborts like rustc (unwinding made the compiler
  1.5 to 3 times slower), so before edition 2024, where each doc test is a program of its own,
  the first failure ends it; edition 2024's merged doc tests report as native ones do.
- crates.io: its index sends CORS headers only for files its cache does not
  hold, so Cargo cannot resolve there from a page, and Dolly hosts no relay.
  `vendor-crates` (its own package) resolves a project's dependencies over the
  index's GitHub mirror, fetches the crates from static.crates.io through the
  HTTP broker and writes `vendor/` and `.cargo/config.toml`; then
  `cargo build --offline`.
- A crate that uses `libc` needs the SDK's copy, because crates.io's has
  wasm32 layouts for this target: `[patch.crates-io] libc = { path =
  "/opt/rust-sdk/src/libc" }` in the project's `.cargo/config.toml`, which
  `vendor-crates` writes when `libc` is among the crates.
- A build script that compiles C needs `CRATE_CC_NO_DEFAULTS=1`, which the
  package sets: the `cc` crate's default flags name a target.
- A Git dependency is fetched by `git`, which reaches HTTP hosts through the broker
  (`CARGO_NET_GIT_FETCH_WITH_CLI=true`, which the package sets); Cargo's own Git opens
  sockets. A host that sends no CORS headers on its Git endpoints, as `github.com`, needs
  a relay, as `git clone` does.
- A session's builds are incremental, as upstream's default: each warns that
  rustc copies its incremental cache, since there are no hard links. Image
  recipes build with `rust-sdk`, which sets `CARGO_INCREMENTAL=0`: a build that
  runs once would only keep that second copy. No `cargo search`, `publish` or
  `login`.
- Its sources are upstream's with target patches only: Cargo's manifest
  without TLS, SSH and HTTP/2 features (`cargo-features`, `git2-curl`), and
  `is_executable`, `jobserver-in-process`, `socket2`, `zlib-rs` and
  `jiff-timezone` ([`config/patches/`](config/patches/),
  [`cargo.toml`](config/cargo.toml)).
- Findings and measurements: [task](../../tasks/20260930-231102-cargo-native/TASK.md).

## Limits

- Panics unwind, by WebAssembly exceptions as C++ exceptions do; a crate built with
  `panic = "abort"` links the same standard library, as the images' programs are built
  (unwinding's landing pads cost them 17% to 35% of their size). No dynamic Rust libraries.
- Executables link threaded (`cc -pthread`) and need `REQUIRES HOST threads@0`.
  The compiler loads proc macros and needs `dso@0`, which a build host enables
  and an image that keeps `rustc` declares.
- Target patches live in [`config/patches/`](config/patches/).
- Rust's target is Emscripten's (`target_os = "emscripten"`,
  [`wasm64-emscripten-probe.json`](toolchain/wasm64-emscripten-probe.json)), where C sees
  `__dolly__`: an exception kept by choice. A Dolly target would need a port of std and
  the `libc` crate, and would leave without a path the crates that have an Emscripten
  branch (2 of ripgrep's 51 vendored crates, 48 of Codex's 1,218); the patches that name
  `emscripten` correct those branches for Dolly. Where std lists the systems that lock
  files, Emscripten is not among them: `File::lock` answers `Unsupported`.

Test: `npm run test:demos -- rust` ([`test/`](test/)).
