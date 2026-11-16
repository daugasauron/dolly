# Rust's and Go's seeds stay host builds that core changes re-trigger, while Dolly rebuilds both itself; the C compiler's seed is its own previous build

- STATUS: OPEN
- PRIORITY: 90
- TAGS: audit,ports,rust,go,bootstrap,0.1.8

## State (2026-11-16 night audit)

Read; the host builds' durations are the build-time audit's measurement below (a Rust seed
rebuild took 23 min of round 1113's seed stage). A bootstrap design change, documented today as
two demo exceptions.

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
