# Patti

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
scripts again. It hashes compiler arguments, environment, sources, generated
outputs, dependencies, native search paths, and the SDK. Changed or corrupt
artifacts rebuild. It does not use incremental compilation or file locks.

The implemented Cargo subset covers workspace package/dependency inheritance,
path dependencies, crates.io dependencies pinned in the workspace lockfile,
version requirements including prereleases, target conditions,
optional/default/forwarded features, and separate build dependency features.
Pinned Git dependencies require an explicit `--patch NAME=PATH` source override;
Patti does not clone repositories. Build scripts compile and execute inside Dolly with Cargo
environment variables, `OUT_DIR`, cfg directives, environment outputs, and
native library/search-path directives.

Procedural macros compile and execute inside Dolly with the complete
[rust-sdk image](../Dollyfile-rust-sdk). They use build-context features and the
compiler's process-local dynamic loader. A macro panic can terminate the compiler
because this SDK uses panic-abort.

Patti builds one selected workspace member's binary and its libraries. Dynamic
Rust libraries and additional build-script directives fail explicitly; it does not implement
Cargo's tests, benchmarks, or profiles. Compiler settings are
Patti's serial, panic-abort configuration, with optimization level 1 by default.

The [ripgrep image](../Dollyfile-ripgrep) builds upstream ripgrep in Chrome.
The default image copies its completed `rg` and build record.
Image recipes stage verified locked source archives and build offline; ordinary
Patti sessions can fetch directly through an allowed registry endpoint.

`--config PATH` supplies explicit build settings. `[build-script.env]` applies to
packages with build scripts, and `[package.NAME.env]` overrides environment
variables for one package. Each `[[rustc]]` rule appends an `args` array and can
match `package`, `crate-name`, `crate-type`, and `context`. `[cache].inputs` lists
additional files or directories whose contents invalidate resumed compilation.
The Codex configuration in `config/codex/patti.toml` uses these settings
for its native libraries, protobuf compiler, and large-crate compiler options.

`--package NAME` selects a binary package within the root's already resolved
feature graph. `--only CRATE` recompiles one target rlib using existing dependency
artifacts and build-script outputs; it is a manual repair command, not a fresh
build. `--only-output PATH` also repairs a specific binary, build script, or
procedural macro. Repair requires only the selected unit's earlier dependency
outputs, so it works after an interrupted build.
