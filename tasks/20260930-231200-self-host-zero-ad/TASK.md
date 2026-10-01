# Build 0 A.D. completely inside the userspace

- STATUS: OPEN
- PRIORITY: 270
- TAGS: demo,zero-ad,bootstrap

Owner goal: the 0 A.D. engine, SpiderMonkey and its dependencies must be compiled inside Dolly instead of by demos/zero-ad/toolchain on the host.

Needs in-sandbox CPython (SpiderMonkey configure), rustc (SpiderMonkey Rust parts), the C/C++ compiler and Make/Ninja; depends on 20260930-231100-self-host-rust for a self-hosted rustc.

Done when: zero-ad images build from pinned sources with only in-sandbox tools and the host exception is removed.

## 2026-10-01: the host-built engine no longer links

The 2026-10-01 checkpoint rebuilt 39 of 40 images; `zero-ad` failed with "wrong
dolly.process stamp": its engine is linked outside Dolly against the process
ABI of 2026-09-30. Relinking (`DOLLY_PROCESS_SYSROOT=.cache/process-sysroot-KEY
bash demos/zero-ad/toolchain/link-engine.sh`) now needs the Emscripten port
libraries again, and `dependencies.sh` fails at CMake configure
(`.cache/0ad/dependencies.log`); the link also needs `-ldolly-http` for its
`libcurl`. Building the engine inside Dolly removes this whole host path.

Relinked on `rebuild-batch` (process sysroot `1d4fab67…`): the link now takes
the host module clients (`-ldolly-runtime -ldolly-http -ldolly-display
-ldolly-gpu -ldolly-audio`) from the process sysroot instead of the stale
`libdollygpu`/`libdollyaudio`, and `libcurl.a` is rebuilt from the current
`src/libcurl-fetch.c`; `dependencies.sh` was not needed. The `zero-ad` image
(snapshot `25b3f8f5…` for image inputs `74246d78…`) passes
`0ad-engine-browser.mjs` and `0ad-graphics-browser.mjs zero-ad hardware`.

- Released in the local checkpoint `35b11b69…` (2026-10-01, 15:21). The engine
  is still host-built; building it inside Dolly remains this task.

Relinked again on `next` for the process ABI of 892c163 (per-module packets
and `dolly.host` ABI digests; process sysroot `ef304c4d…`), with `libcurl.a`
rebuilt against those headers: engine `9bf417de…` declares `http`, `display`,
`gpu` and `audio` with digests. The `zero-ad` image (snapshot `56cb41bd…` for
image inputs `fda71d69…`) passes `0ad-engine-browser.mjs` and
`0ad-graphics-browser.mjs zero-ad hardware`. In a worktree, `link-engine.sh`
needs real copies of its `.cache/0ad` inputs: the container mounts only the
worktree, so symlinks into the root checkout do not resolve.

## In-sandbox build (2026-10-01 night, `work/zero-ad-self`)

Plan: dependencies, then the engine against the host-built SpiderMonkey, then
SpiderMonkey. Measured in a scratch shell (headless Chrome on the
`openal-build` image, sources fetched with `curl`), host load 9-23 from other
agents.

- Dependencies build inside Dolly with `cc`, CMake and Make
  (`zero-ad-deps.dm`): libpng, FreeType, libogg, libvorbis, fmt and libxml2
  with their CMake (18 s, then about 70 s for the last four together); ICU 68.2
  common/i18n/stubdata, libsodium and ENet compile every source of their
  directories as Emscripten's ports and libsodium's `build.zig` do (about 120 s
  at `-j4`; ICU and libsodium have only autotools, which Slop cannot run).
  Boost is headers only. pkgconf 2.5.1 (C, 1 s) provides `pkg-config`, which
  premake requires for every library; `.pc` files are written for the libraries
  built without their upstream build system and for zlib/libcurl.
- Premake 5.0.0-beta7 builds in 13 s with `cc` as Bootstrap.mak does (bootstrap
  binary, `embed`, then the binary with embedded scripts).
  `premake-dolly.patch` names the host (`__EMSCRIPTEN__` -> `emscripten`,
  `__wasm64__` -> `wasm64`) instead of `#error Unknown platform`, and lets
  `os.getversion` use `uname`.
- Premake writes the engine's Makefiles inside Dolly in 2 s. `engine.patch`
  gained two premake fixes: `pkgconfig.lua` closes its `io.popen` handles (each
  open handle kept a zombie; the kernel's 32 process records ran out:
  `pkg-config: spawn failed: Resource temporarily unavailable`), and
  emscripten targets ask pkg-config for static link flags (`-logg` comes from
  vorbis' `Requires.private`). The premake build options no longer carry emcc
  spellings (`-sWASM_LEGACY_EXCEPTIONS=0`, `-msimd128`, ...); `c++` has that
  profile by default.
- The whole engine, 499 translation units, compiles with Dolly's `c++` at
  `-O2 -j4` in 410 s; linking `pyrogenesis` with the host-built
  `libjs_static.a`/`libjsrust.a` takes about 1 s and gives a 23,060,981-byte
  executable (host-built: 22,624,571) that prints `Pyrogenesis 0.28.0`.
  Fixes needed: `build/build_version` must be staged; OpenAL's CMake adds
  `-pthread` whenever the compiler accepts it, which made `openal.pc` turn the
  engine into a threaded process (`sched_get_priority_min` is then undefined:
  the threaded process libc lacks it). `openal.dm` now sets
  `HAVE_PTHREAD=OFF`: its mixer is serial.
- Driver gap: premake's `ALL_CPPFLAGS` passes `-MP`, which `c++` rejected
  (`unsupported option: -MP`, exit 64). The recipe overrides `ALL_CPPFLAGS`
  without it until `c++` accepts `-MP` (core commit 1d02ab5, which needs a
  runtime rebuild before images see it).
- Dolly's `tar` rejects pax global headers (`tar: validate path at
  pax_global_header (errno 138)`), as in premake's GitHub archive; the
  source is repacked on the host like every other prepared source.

Images (`work/zero-ad-self`, runtime `afcb2a66…` before the `-MP` commit,
host load 15-25):

| image | time | snapshot |
| --- | --- | --- |
| `openal-build` (`HAVE_PTHREAD=OFF`) | rebuilt | 251,826,541 B |
| `zero-ad-deps` (`FROM openal-build`, SDL2 module, deps) | 690 s; build script 392 s | 425,865,364 B |
| `zero-ad-engine` | `make -j4 pyrogenesis` 499 s | 448,933,482 B |
| `zero-ad` (`COPY FROM zero-ad-engine` the engine) | 286 s | 2,076,038,510 B |

The engine in `zero-ad-engine` is 23,060,981 bytes, as in the scratch build.
Checks with it:

- `0ad-engine-browser.mjs` (engine taken from the `zero-ad-engine` snapshot,
  `test/fixtures/engine.mjs`): passes; replay final state
  `be99497b21b9cb86d3a1478d2e2e09a6` and control save/load hash
  `ff2fbc7d000708ab8b70ed0eaec257df` are identical to the host-built engine's
  in the same run of the test.
- `0ad-graphics-browser.mjs zero-ad hardware` (Xvfb, NVIDIA adapter): passes
  (boot 38.5 s, combat 46 ms per frame, economy 33 ms, audio, quick
  save/load, fresh processes, shell recovery). The first of two runs failed
  once at "Changing GPU skinning during a match must change compute
  activity" after typing into the console under load; the rerun passed.

Still from the host: SpiderMonkey (`mozjs-host.tar.gz`: its `dist/include`,
`libjs_static.a` and `libjsrust.a` from `toolchain/build-spidermonkey.sh`),
the WGSL shaders (Naga, a Rust tool, run by `toolchain/prepare-shaders.sh`)
and the content packaging (`package-*.py`).

### SpiderMonkey 128.13.0 inside Dolly: blockers found

Probed with the pinned `mozjs-128.13.0.tar.xz` (0 A.D.'s patches, which
include `FixPython3_14.diff`, plus `spidermonkey.patch`) in the
`llvm-tablegen` image (CMake build image with CPython 3.14.7):
`python configure.py --enable-project=js --disable-jit ... --disable-bootstrap`.
A native build of `src/slop.c` (four Dolly calls stubbed with
`posix_spawn`) ran the shell scripts outside the browser for quick checks.

- Python is not the problem: mach creates its virtualenv in Dolly's
  CPython 3.14 ("Created Python 3 virtualenv") in about a second.
- mozbuild cannot name a wasm host. Without `--host` it runs
  `autoconf/config.guess`, which Slop stops on (`tab-stripping <<-
  here-documents are unsupported`); with `--host=wasm64-unknown-wasi` or
  `--host=wasm64-unknown-emscripten`, `split_triplet` (init.configure:472)
  accepts WASI only for the target (`allow_wasi`), so configure dies with
  `ERROR: Unknown OS: wasi` / `Unknown OS: emscripten`. A host patch is needed;
  claiming Linux is not allowed.
- `autoconf/config.sub` runs in Slop but prints `unset: invalid name: -v`
  (Slop's `unset` takes no options).
- `js/src/old-configure` (autoconf 2.13, 2,794 lines) still runs under
  mozbuild. Under native Slop it parses and prints `--help`; a real run stops
  on `trap: command not found` and `.: a script path is required` before its
  first check. More Slop gaps are likely behind these.
- Rust: configure requires `cargo` (version check), the build runs
  `cargo rustc` for the `jsrust` static library and `cargo metadata`
  (`build/RunCbindgen.py generate_metadata`), and the js build needs
  `cbindgen` (host build: 0.26.0 via `cargo install`). Dolly has rustc 1.98.1
  (the seed that already compiled `libjsrust.a` for the host build) but no
  Cargo: Patti builds locked projects, only binaries as roots
  (`root_binary`: "select exactly one binary with --bin"; a `staticlib` crate
  type fails "dynamic Rust libraries are not supported"). `jsrust` is
  `crate-type = ["staticlib"]` in a 672-package workspace lockfile with
  `[patch.crates-io]` path overrides.

Decision needed (owner): how Cargo-driven builds run in Dolly. Options: build
Cargo itself with Patti (heavy: curl, libgit2 and TLS sys crates); teach
Patti the Cargo subset mozbuild calls (`--version`, `metadata`,
`rustc --lib`); or build `jsrust` with Patti (after adding static-library
roots) and keep Cargo out of mozbuild with a build-system patch.
- The C++ half compiles in Dolly. Measured with the host build's own
  configure output (generated headers, `Unified_*.cpp`, `js-confdefs.h`) and
  its compile commands minus emcc-only flags (`-matomics`, `-msimd128`,
  `-mthread-model`, `-gdwarf-4`, `-fno-sized-deallocation`,
  `-fno-aligned-new`, `-fno-math-errno`, `-fomit-frame-pointer`,
  `-ffp-contract=off`, `-ferror-limit=0`, `-fstandalone-debug`; `c++` rejects
  each of these today): all 158 objects of `libjs_static.a` compile with
  `c++ -O2` at `-j3` in 320 s wall, 952 s summed, slowest TU 30 s, no
  failures and no Worker stack overflow. So SpiderMonkey is blocked by its
  configure and Cargo integration, not by the compiler.
