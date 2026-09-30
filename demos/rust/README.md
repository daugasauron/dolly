# Rust

An experimental Rust toolchain: an external compiler seed, Patti, and tools built from source inside Dolly.

## Images

- `rust-sdk`: Rust compiler, standard library and procedural macros.
- `rust-build`: Rust SDK and Patti for compiling tools.
- `rust-tools`: Interactive Rust compiler and Patti build shell.
- `ripgrep`: Build ripgrep with Patti and retain rg.
- `fd-build`: Build fd with Patti and retain fd.
- `protox-build`: Source-built protobuf compiler for Codex.

Browser test: `npm run test:demos -- rust` (`demos/rust/test/rust-browser.mjs`); its Tokio check needs `python3 demos/codex/prepare-codex-sources.py` once.

## Compiler seed and source-built tools

`npm run build:rust-seed` explicitly builds the external Rust 1.98.1 / LLVM
22.1.8 seed after the C runtime. It requires Linux x86_64, Podman, Python 3.12+
(`tarfile` data filters and `tomllib`), curl and patch. Native bootstrap archive
hashes are in `demos/rust/toolchain/bootstrap-sources.json`; compiler/library patches
and target configuration live beside them. The completed SDK contains rustc,
std, proc_macro, the target libc source and the small POSIX spawn archive.
Its final Wasm executable is validated against `dolly-process-0` before packing.
Changed preparation inputs invalidate prepared source; the seed cache verifies
its recorded input key and artifact checksum. Run this command again after
changing Rust bootstrap sources or target inputs. Ordinary image preparation
stages a checksum-verified completed seed, or the existing HOST artifact pinned
in `demos/rust/rust-sdk.dm`; it never starts an external Rust/LLVM build. A missing
or corrupt seed fails source preparation before any image builds. The image loader still
checks the compiler against the current process ABI.

The HTTP body staging addition (operation 83) preserves every earlier operation,
packet layout, constant and import type. For this additive transition, the pinned
Rust compiler seed's process stamp was migrated after validating it against the
old contract and comparing the complete earlier C layout. Only that custom
section changed; executable bytes remained identical. The migrated compiler is
validated against the new contract and exercised by the ripgrep/fd source builds.
A fresh compiler seed build writes the current stamp directly.

The [Rust SDK image](Dollyfile-rust-sdk) imports that seed and compiles its
C linker adapter in Dolly. [Rust build](Dollyfile-rust-build) adds curl and C Patti;
[Rust tools](Dollyfile-rust-tools) combines these artifacts with the interactive system.
[Ripgrep](Dollyfile-ripgrep), [fd](Dollyfile-fd-build) and
[Protox](Dollyfile-protox-build) compile locked upstream sources with Patti
inside the browser. `search-tools.dm` copies `rg` and `fd` from their build images; the Pi module
and the Codex image use it, so Pi, Studio and Codex images carry both tools. The Rust SDK
starts from the C/C++ [compiler base](../../Dollyfile-system-build), adding zlib and
gzip. Git, the display and application startup are not compiler inputs. Build command records remain under
`/usr/share/dolly/builds`; the Rust compiler stays in the build images.

`demos/rust/config/sources.json` pins upstream tool archives. Host preparation stages
source and lockfile-checksummed crate archives, allowing the image recipes to
build offline without registry Git or CORS dependencies. It compiles no
application code. Ripgrep and fd's libc lock entries explicitly select the SDK's
patched 0.2.186 source; their other dependency pins are unchanged. fd's target
patch uses the serial ignore walker, preserving its existing filters and output
buffering; a small ignore patch exposes directory pruning. Exec jobs run serially,
requests for multiple workers fail explicitly, and SIGINT uses normal process
termination instead of ctrlc's helper thread. The nix patch excludes its unsupported
`sethostname` function, and Jiff uses its Unix timezone implementation instead of
calling browser JavaScript. These patches live under
`demos/rust/config/patches` and apply only to the Emscripten target.

This remains an experimental Emscripten-based Rust target with serial compiler
execution and panic-abort. Cargo, incremental compilation, file locking and
application threads are not provided. Compiler bootstrapping inside Dolly and
byte-identical Rust seeds across different host checkout paths are not claimed.

## Patti

Patti builds locked Rust source packages inside Dolly. Like Bonnie, it obtains
verified source archives through the existing HTTP broker, then runs the build
tools in Wasm. Patti is a C command, compiled inside Dolly with zlib and a pinned
upstream TOML parser. It uses Dolly's curl and the experimental Rust SDK; Python is not
a runtime dependency.

```sh
patti fetch --manifest-path project/Cargo.toml
patti build --offline --manifest-path project/Cargo.toml --bin program
```

The executable and `patti-build.json` command record go under `target/patti`.
`--target-dir` changes that directory. `--features`, `--no-default-features`,
`--opt-level`, and explicit `--patch NAME=PATH` source overrides are available.
Use `--patch NAME@VERSION=PATH` to override only one locked registry version.
The `patti` image module requires an image that already supplies `rustc`.

Patti requires an existing `Cargo.lock`; it does not update dependency versions.
It downloads exact archives from `https://static.crates.io/crates`, avoiding
registry Git access and redirecting API endpoints. Downloads are serial, use
Dolly's curl, and verify the lockfile SHA-256 before extraction. The browser
still decides which destinations are allowed. `--registry` selects a direct
archive mirror with the same directory layout, useful where CORS or destination
policy prevents access to the default server.

Verified archives live in `~/.cache/patti`, or `--cache`. Offline builds never
download missing archives. Each invocation verifies and extracts fresh source
from the cache, preserving archive modification times to filesystem precision.
By default, builds regenerate all crate artifacts and build-script outputs. `--resume` verifies
content fingerprints before reusing compiler artifacts and always runs build
scripts again. It hashes compiler arguments, environment, every source file in the
compiler's dependency information (including `include_str!` inputs outside the
package), generated outputs, dependencies, native search paths, and the SDK.
Changed or corrupt artifacts rebuild. It does not use incremental compilation or file locks.

The implemented Cargo subset covers workspace package/dependency inheritance,
path dependencies, crates.io dependencies pinned in the workspace lockfile,
version requirements including prereleases, target conditions,
optional/default/forwarded features, and separate build dependency features.
Pinned Git dependencies require an explicit `--patch NAME=PATH` source override;
Patti does not clone repositories. Build scripts compile and execute inside Dolly with Cargo
environment variables, `OUT_DIR`, cfg directives, environment outputs, and
native library/search-path directives; search paths also reach dependents. As in
Cargo, a `[[bin]]` without `path` uses `src/bin/NAME.rs`, `src/bin/NAME/main.rs`
or, for the package's own name, `src/main.rs`, and only registry packages have
their lints capped. The SDK's `rustc` sets `RUSTC_BOOTSTRAP=1` for every crate, so
build scripts that probe for nightly features enable unstable code paths.

Procedural macros compile and execute inside Dolly with the complete
[rust-sdk image](Dollyfile-rust-sdk). They use build-context features and the
compiler's process-local dynamic loader. A macro panic can terminate the compiler
because this SDK uses panic-abort.

Patti builds one selected workspace member's binary and its libraries. Dynamic
Rust libraries and additional build-script directives fail explicitly; it does not implement
Cargo's tests, benchmarks, or profiles. Compiler settings are
Patti's serial, panic-abort configuration, with optimization level 1 by default.

The [ripgrep image](Dollyfile-ripgrep) builds upstream ripgrep in Chrome.
The default image copies its completed `rg` and build record.
Image recipes stage verified locked source archives and build offline; ordinary
Patti sessions can fetch directly through an allowed registry endpoint.

`--config PATH` supplies explicit build settings. `[build-script.env]` applies to
packages with build scripts, and `[package.NAME.env]` overrides environment
variables for one package. Each `[[rustc]]` rule appends an `args` array and can
match `package`, `crate-name`, `crate-type`, and `context`. `[cache].inputs` lists
additional files or directories whose contents invalidate resumed compilation.
The Codex configuration in `demos/codex/config/patti.toml` uses these settings
for its native libraries, protobuf compiler, and large-crate compiler options.

`--package NAME` selects a binary package within the root's already resolved
feature graph. `--only CRATE` recompiles one target rlib using existing dependency
artifacts and build-script outputs; it is a manual repair command, not a fresh
build. `--only-output PATH` also repairs a specific binary, build script, or
procedural macro. Repair requires only the selected unit's earlier dependency
outputs, so it works after an interrupted build.
