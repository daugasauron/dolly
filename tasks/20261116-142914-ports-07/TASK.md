# Rust's and Go's seeds stay host builds that core changes re-trigger, while Dolly rebuilds both itself; the C compiler's seed is its own previous build

- STATUS: OPEN
- PRIORITY: 90
- TAGS: audit,ports,rust,go,bootstrap,0.1.8

## State (2026-11-17)

The question of 2026-11-16 (should Rust's and Go's seeds be Dolly's own builds of the previous
round, pinned and uploaded with the release as the seed's compiler is?) was answered yes by the
integrator on 2026-11-17. Done on `ws/seeds` (on `integrate/0.1.8`, with the release scripts'
half); open until the 0.1.8 rounds confirm the list at the end.

- `demos/rust/pin-seed.mjs` archives `rust-build`'s `/opt/rust-sdk` (rustc and its library) with
  the `cargo` package's linked Cargo; `demos/go/pin-seed.mjs` the `go` package's ten commands
  with what `cmd/dist` generated for them (`pkg/include`, six `z*.go`). Each is pinned in its
  demo's `source-pins.sh` (`DOLLY_RUST_SEED_*`, `DOLLY_GO_SEED_*`) at the release's asset URL;
  staging takes it by its pins (`scripts/seed-archive.mjs stage`) and refuses an executable for
  another process contract or host module, naming `seed-archive.mjs restamp`.
- `go-sdk` takes the GOROOT's sources from staging (`prepare-go-source.sh`: release, patch,
  `zdolly.go` with the tree's digests), so a patch or contract change reaches the build without
  a new seed; the `go` recipe's comparison with the seed became the round's pin. `rust-sdk` no
  longer links Cargo; `rust-build` installs the libc crate of its library in `src/libc`.
- No host compiler run is left for `rust-build` or `go`: `build-rust-toolchain.sh` and the ten
  scripts it ran are gone (last in `6a610431`); `rust-llvm`'s staging runs
  `toolchain/prepare.sh` itself, which took the LLVM fetch and keeps its tree while its inputs
  hold. `build-go-toolchain.sh` stays for rclone's `go list` and a bootstrap from nothing. A
  crate patch rebuilds only images.
- `round.sh`'s seed stage builds no seed; its compiler stage pins the C, Rust and Go seeds after
  the images and fails, committing the pins, unless all three are unchanged. The release
  checklist requires the three at this release's assets with their bytes in `.cache`, uploads
  them, and prints a check per seed that the release holds the pinned bytes.
- The pinned seeds are 0.1.7's, restamped for `integrate/0.1.8`'s process contract (`c5168b6c…`,
  which only adds SIGUSR1 and SIGUSR2): Rust `f2b73525…`, Go `d1aee893…`, staged with
  `go-source.tar.gz` naming that contract in `zdolly.go`.

Proved on `proof/seeds` (v0.1.7 `b09b1e243` with these changes, so that only the seeds' images
rebuild; never to merge), and on `ws/seeds` where a line says so:

- The archives from 0.1.7's images: `dolly-rust-seed-9415c5c3….tar.gz` (393 files, 84.6 MB:
  `rustc-real` and its library from `rust-build`, `cargo` from the `cargo` package) and
  `dolly-go-seed-9e4b977f….tar.gz` (22 files, 42.2 MB). Pinning either twice gives the same
  bytes. `build-go-toolchain.sh`, run here (1 min 22 s), writes the same Go archive, byte for
  byte: 0.1.7's `go` package is its cross-built seed rebuilt in Dolly, and the bootstrap path
  gives the pinned seed.
- `rust-sdk` and `go-sdk` built from them (`rustc 1.98.1`, `LLVM version: 22.1.8`, `cargo
  1.98.1`; `go version go1.27.3 dolly/wasm64`). `rust-build` on that seed took 66 min (first
  rustc 14m49s, library 59 s, second rustc 18m15s, rustdoc 6m35s, the library again 2m08s and
  the recipe's byte check of it, Cargo 20m33s, then `built by cargo: 42`): all 392 files of
  its `/opt/rust-sdk` that the seed holds, the 267 MB `rustc-real` among them, and its Cargo
  are byte for byte the seed's. The 0.1.7 seed is a fixed point: Rust's third generation is
  its second. The `go` package on the Go seed and the staged sources (7 min) gave the seed's
  ten commands again.
- The compiler stage's three pins on the images built here (`pin-seed-compiler.mjs`, then
  `demos/rust/pin-seed.mjs` and `demos/go/pin-seed.mjs`): `c98f9ab6…`, `9415c5c3…` and
  `9e4b977f…`, the pins they started from, so the stage would pass as the fixed point.
- On those images, `rust-browser.mjs` (`rust-tools`: rustc, Cargo with build scripts, procedural
  macros, path, vendored and Git dependencies, `cargo test`, a Tokio HTTP client) passed in
  Chrome (169.7 s) and Firefox (221.2 s); `go-browser.mjs` (`go-tools`: go build and run,
  gofmt, esbuild built by go, go get, http.Get, signals, exec) in Chrome (93.2 s) and Firefox
  (89.8 s); `vendor-crates-browser.mjs` (amy installs `cargo` in `default`) in Chrome (27.6 s)
  and Firefox (35.1 s); `npm run test:source`, 471 passed.
- `toolchain/prepare.sh` and `prepare-rustc-sources.py` as on `ws/seeds` (the host scripts
  removed, `env.sh` trimmed), run in a scratch copy from nothing: `rustc.tar.gz` `29234737…`
  and `rust-llvm.tar.gz` `29562231…`, the bytes `rust-build` and `rust-llvm` pin; a second
  `prepare.sh` did nothing.
- Restamp, on `ws/seeds` after `npm run build:runtime` (contract `c5168b6c…`):
  `seed-archive.mjs restamp` replaced `a193b87b…` in all 12 executables (twice in Go's `link`,
  its stamp and the linker's copy) and left `http@0`'s, which did not change; staging then took
  both seeds. Before it, in a scratch copy with `ws/seed`'s contract, staging refused the Rust
  seed naming the command.
- The checklist's seed step, run on these pins: it names the three `.cache` files for `gh
  release create v0.1.7` and refuses `v0.1.8`; its printed check downloaded v0.1.7's published
  C seed and matched its pin.
- On `ws/seeds`, `npm run test:source` passes but for one test, 472 of 473: `Dollyfile-dolly-docs:8`
  pins `docs/process-model.md` at `5a168570…`, which is `2c4cf752…` on `integrate/0.1.8` since
  `ws/seed`'s SIGUSR commit; `lint:dollyfiles` passes.

What the 0.1.8 rounds must do:

1. Copy `work/seeds/.cache/dolly-rust-seed-f2b73525….tar.gz` and `dolly-go-seed-d1aee893….tar.gz`
   into the round tree's `.cache` (the pins name v0.1.7's release, which does not hold them).
   If the process contract or a host module changes again before the round, staging stops
   naming `node scripts/seed-archive.mjs restamp DOLLY_RUST_SEED` (and `DOLLY_GO_SEED`): run
   them and commit the two `source-pins.sh`.
2. `scripts/round.sh` from `seed`: the Rust and Go chains rebuild with the catalog (rust-build
   about 66 min).
3. Its compiler stage pins three new seeds (C's and Rust's linked with the new libc, Rust's with
   `rust-llvm` rebuilt, Go's linker built from the new `zdolly.go`), commits them and fails as
   not yet a fixed point; the round on them must leave all three pins unchanged, as the
   proof's did.
4. The release uploads that fixed point's `.cache/dolly-seed-compiler-*.tar`,
   `dolly-rust-seed-*.tar.gz` and `dolly-go-seed-*.tar.gz`, pinned at `v0.1.8`, and runs the
   three printed checks. A fresh checkout then builds `rust-build` and `go` from them: done.

## What

AGENTS.md, bootstrapping direction: "the seed's compiler is the one the previous seed built
inside Dolly". For C that holds: `demos/llvm/pin-seed-compiler.mjs` pins what `llvm-cc` linked,
and a host build of the compiler is only how a bootstrap from nothing starts (`docs/sources.md`).
Rust and Go are recorded as exceptions (`demos/rust/README.md` "The seed", `demos/go/README.md`
"The seed"), and their seeds are rebuilt outside Dolly whenever their keys change:

- Rust: `demos/rust/build-rust-toolchain.sh:13-19` keys the seed on `include/dolly/process.h`,
  `include/dolly/runtime.h`, every file of the process sysroot, `demos/rust/toolchain/*` and every
  crate patch in `demos/rust/config/patches/`; a change rebuilds it in Podman on Linux x86_64
  (LLVM 22 with emcc, rustc, std, Cargo; `toolchain/build-llvm.sh`, `build.sh`, `build-sdk.sh`,
  `build-cargo.sh`, 448 lines of host scripts). Five of the files there only Codex applies
  (`reqwest.patch`, `reqwest-broker.rs`, `serial2.patch`, `sqlx-sqlite.patch`,
  `tokio-target.patch`: `demos/codex/prepare-codex-sources.py:74-107`), so a fix to one of them,
  or a libc change, means a host Rust build before any image, and then the whole Rust chain.
- Go: `demos/go/build-go-toolchain.sh:11-17` keys it on the process contract's and `http@0`'s
  digests; a contract change cross-builds Go again on the host.
- 19 commits from 2026-10-16 to 2026-11-16 touched those inputs (`git log` of
  `include/dolly/process.h`, `include/dolly/runtime.h`, `process/`, `demos/rust/config/patches`,
  `demos/rust/toolchain`).

Measured from the rounds' logs by the build-time audit (`work/round1113/build/round-1113*-evidence/`,
the files' times): round 1113's seed stage rebuilt the Rust seed in 23 min (`runtime.log` ended
08:17:24, `rust-seed.log` "built and validated the complete Rust seed" 08:40:18); round 1113b's Go
seed took 2 min (11:44:46 to 11:46:40). In rounds 1114, 1115 and 1117 the seeds were "verified
cached" in under a second. Round 1114's first attempt stopped on a failed Rust seed after 6 min
(`round-1114-attempt1.log`).

Dolly already rebuilds both from source: `Dollyfile-rust-build` makes a second-generation
rustc with no seed code in it (README "Built inside Dolly"), and `Dollyfile-go:11,22-25` makes
every Go command and fails unless each is byte for byte the seed's. Either result could be the
next seed, pinned by digest as the C compiler's is.

## Smallest fix

Pin the `rust` and `cargo` packages' compiler, standard library and Cargo (and the `go`
package's GOROOT) as the next seeds' archives, uploaded with the release as the seed compiler is;
keep `build-rust-toolchain.sh` and `build-go-toolchain.sh` only for a bootstrap from nothing, and
take crate patches and the libc out of the seed's key. Until then the step that stands alone:
Codex's five patches move to `demos/codex/config/`, beside its other ten, and leave the seed's
key.

## Done when

A fresh checkout builds `rust-build` and `go` from pinned seeds without Podman or a host
compiler run; a crate patch change rebuilds only images, and a contract change takes a round as
the C compiler's does (`docs/sources.md`, "The seed's compiler").
