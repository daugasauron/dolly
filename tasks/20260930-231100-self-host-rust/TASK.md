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

## rustc built inside Dolly (2026-10-08)

Measured in one headless Chrome session of an image composed from
`cmake-build` with `python`, `cargo`, `curl` and `git` (driver and scripts:
`build/rust-evidence/`, `build/rust-fixtures/` in `work/rust`, not in git).

| Step | By | Time |
| --- | --- | --- |
| LLVM 22.1.8 (Rust's fork): 11 library targets and `llvm-config` | Dolly's `c++`, 4 jobs | 1,351 s |
| rustc 1.98.1, 251 crates, through Cargo (stage 1) | the seed's rustc | about 13 min |
| standard library, 22 libraries (`-Z build-std`) | stage 1 | 63 s |
| rustc again (stage 2) | stage 1 with its own std | 634 s |
| standard library again | stage 2 | 62 s |
| rustc again (stage 3) | stage 2 with its own std | 623 s |
| Cargo 0.99.0, 16 codegen units | stage 3, driven by the seed's Cargo | 641 s |

- Stage 2 and stage 3 are the same bytes: `rustc-main` (263,521,918 bytes,
  SHA-256 `86292f15…28940a2`) and all 263 libraries of the build, 264 files
  of 264. The standard library built by stage 1 and by stage 2 is the same
  22 files. Stage 1 differs from stage 2, as expected: it links the seed's
  standard library, whose paths are the host's. Sources and target directory
  stood at the same paths for every stage (`/opt/rust-sdk`, `/tmp/r`).
- The built compiler compiles and runs a program, loads procedural macros
  (`serde` with `derive`, `serde_json`, through Cargo) and builds Cargo; the
  Cargo it built builds that program too.
- Stages 1 to 3 were built with the development profile's debug assertions,
  as the seed is. The recipe (`Dollyfile-rust-build`) turns them off, like a
  released rustc; that configuration is checked by the image build, not by
  the comparison above.

### What it took

- LLVM: `llvm-config` finds its prefix through `getMainExecutable`, which has
  no Dolly branch and answered `/`; `llvm-main-executable.patch` adds Dolly
  beside OpenBSD (argv[0]). Otherwise as `demos/llvm` configures LLVM 24.
- `cc -rdynamic` refuses `-pthread`, and rustc must be a host of libraries:
  it is linked without threads. `dolly-rust-link` then wraps `dlopen`,
  `dlsym`, `dlerror` and `dlclose` (Rust binds those names, so the compiler's
  `-D dlopen=dolly_dlopen` never sees them; without the wrap every proc macro
  failed with "dynamic linking not enabled") and exports what std inside a
  loaded library imports (`emscripten_futex_wait`/`wake`, `posix_spawnp`,
  `fork`, `_exit`, `setgroups`, `chroot`, `__trap`).
- The single-threaded libc has no `pthread_attr_init`, `_setstacksize` or
  `_destroy`, which std references. The seed links musl's, compiled on the
  host; in Dolly `demos/rust/pthread-attr.c` stands in. They belong in the
  process libc (`src/process/pthread-stubs.c`) at the next seed change, and
  both copies then go.
- rustc needs `-Wl,--initial-memory=33554432`; `LLVM_USE_LIBCXX=1`; and the
  `cc` crate's default flags off (`CRATE_CC_NO_DEFAULTS=1`).
- The repository archive of Rust lacks what std needs (the backtrace
  submodule, std's crates): the standard library is built from the `rust-src`
  component, as the seed's is.

### Found on the way (not fixed here)

- `cargo run` fails after building: Cargo `exec`s the program, and Dolly has
  no `exec` (`ENOEXEC`). `git help` fails the same way.
- Dolly's `tar` reads neither GNU long names nor links, so a `.crate` archive
  cannot be unpacked in Dolly; crates are extracted when sources are staged.
- `ar` only creates archives (`r`, `q`, `s`); `cc -c` takes one source.
- Slop's `cd` fails once its directory is deleted
  (`tasks/20261008-134330-deleted-cwd`).

### In the tree (`core/self-host-rust`)

- `Dollyfile-rust-llvm`, `Dollyfile-rust-build` (rustc, std, Cargo), `rust`
  and `cargo` as copies out of `rust-build`; sources staged by
  `prepare-rustc-sources.py`.
- Not done: an on-demand test that repeats the stage comparison through the
  recipe's own commands (as `demos/llvm/test/stage2-browser.mjs` does); the
  images downstream of `rust` (`pi`, `zero-ad-spidermonkey`) rebuilt.
