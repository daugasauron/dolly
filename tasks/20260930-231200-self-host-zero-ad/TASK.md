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

## In-sandbox build (2026-10-01/02 night, `work/zero-ad-self`)

### What builds inside Dolly now

Every program in the `zero-ad` image except SpiderMonkey's archives is now
compiled and linked by Dolly's own `cc`/`c++`, CMake and Make:

| image | builds | final run (`-MP` runtime, load 4-15) | snapshot |
| --- | --- | --- | --- |
| `openal-build` | OpenAL Soft, now with `HAVE_PTHREAD=OFF` | rebuilt | 251,826,787 B |
| `zero-ad-deps` (`FROM openal-build`, SDL2 copied from `sdl2-build`) | pkgconf 2.5.1; libpng, FreeType, Ogg, Vorbis, fmt, libxml2 (CMake); ICU 68.2, libsodium, ENet (source directories); Boost headers; ENet and OpenAL probes | build script 229-461 s | 427,388,076 B |
| `zero-ad-engine` | premake 5.0.0-beta7 (13 s), 0 A.D.'s Makefiles, 499 engine TUs, `pyrogenesis` link, SpiderMonkey probe | `make -j4 pyrogenesis` 345 s | 458,146,344 B |
| `zero-ad` | copies the engine; content as before | 286 s | 2,076,040,038 B |

The engine is 23,060,981 bytes (the host-linked one: 22,624,571). Sources are
the pinned upstream archives of `build-sources.tsv` and the 0 A.D. release
tarball, staged by `prepare-build-sources.sh`. The host engine build
(`toolchain/{build-engine,dependencies,engine,link-engine,prepare-engine,enet,openal,link}.sh`,
`dependencies.tsv`, `wasm64.cmake`) is gone; `toolchain/` keeps only the
SpiderMonkey bootstrap and the content preparation.

### Evidence

All on the branch's images, engine and probes read from the image snapshots
(`test/fixtures/image-file.mjs`):

- `0ad-engine-browser.mjs` passes; replay final state
  `be99497b21b9cb86d3a1478d2e2e09a6` and control save/load hash
  `ff2fbc7d000708ab8b70ed0eaec257df` are identical to the host-linked engine's
  in the same run of the test (so the simulation is bit-for-bit the same).
- `0ad-graphics-browser.mjs zero-ad hardware` (Xvfb, NVIDIA adapter) passes:
  combat 17 ms per frame at load 4 (46 ms at load 20), economy, audio, quick
  save/load, fresh processes, shell recovery. One earlier run under load
  failed once at "Changing GPU skinning during a match must change compute
  activity" (console typing); every rerun passed.
- `0ad-multiplayer-browser.mjs` (headless relayed pair) passes: 149
  synchronized turns, shared hash `f3dd66c38dd8ab65aafdbdfe020a56d9`.
- `0ad-spidermonkey-browser.mjs`, `0ad-openal-browser.mjs` and
  `0ad-enet-browser.mjs` pass with probes built in the images.

### What shaped the recipes

- Scratch measurements (headless Chrome shell on `openal-build`, sources
  fetched with `curl`, load 9-23): libpng 18 s; Ogg, Vorbis, fmt, libxml2 70 s
  together; ICU, libsodium and ENet about 120 s at `-j4` (ICU and libsodium
  have only autotools, which Slop cannot run, so their source directories
  are compiled as Emscripten's ports and libsodium's `build.zig` do); the
  engine's 499 TUs 410 s at `-j4`, link about 1 s.
- `premake-dolly.patch`: premake names the host (`__EMSCRIPTEN__` ->
  `emscripten`, `__wasm64__` -> `wasm64`) instead of `#error Unknown
  platform`, and `os.getversion` uses `uname`. Bootstrap.mak's two stages run
  directly (its own `make -j` is unbounded).
- `engine.patch`: premake's `pkgconfig.lua` closes its `io.popen` handles
  (each open handle kept a zombie until the kernel's 32 process records ran
  out: `pkg-config: spawn failed: Resource temporarily unavailable`);
  emscripten targets take static pkg-config flags (`-logg` comes from Vorbis'
  `Requires.private`); the build options lost their emcc spellings.
- OpenAL's CMake adds `-pthread` whenever the compiler accepts it, and
  `openal.pc` then turned the engine into a threaded process (whose libc lacks
  `sched_get_priority_min`): `HAVE_PTHREAD=OFF`, the mixer is serial.
- `pkg-config` descriptions are written for SDL2 (copied without its own)
  and the libraries built without their build system; premake needs one for
  every library. `build/build_version` must be staged.
- Dolly's `tar` rejects pax global headers (`tar: validate path at
  pax_global_header (errno 138)`), as in premake's GitHub archive; it is
  repacked on the host like every prepared source.

### Core changes on the branch (separate commits)

- 1d02ab5 `cc`/`c++` accept `-MP` (premake's `ALL_CPPFLAGS`; rejected with
  exit 64 before). `test/cpp-browser.mjs`, Chrome and Firefox.
- c0bf8c8 Slop: `unset -v/-f`, `<<-` here-documents, backquoted subshells
  (`` `(umask 077 && ...)` `` was parsed as `$((`). Cases in
  `test/fixtures/slop-cases.mjs` against Bash, native under ASan, and
  `test/slop-browser.mjs` in Chrome and Firefox.
- 7b24de0 `cc`/`c++` honour `SOURCE_DATE_EPOCH` (Clang's driver maps it to
  cc1's `-source-date-epoch`; Dolly's builds the cc1 arguments itself). Two
  `zero-ad-engine` builds from identical inputs had differed in 2,079 bytes:
  0 A.D. embeds `__DATE__ __TIME__`. `test/cpp-browser.mjs`, Chrome and
  Firefox.

### Still from the host

- SpiderMonkey 128.13.0: `toolchain/build-spidermonkey.sh` cross-compiles
  `libjs_static.a`, `libjsrust.a` and `dist/include`, staged as
  `zero-ad-build/mozjs-host.tar.gz`.
- Content: the WGSL shaders (Naga, a Rust tool, `toolchain/prepare-shaders.sh`)
  and the packaging of the release data (`package-*.py`).

### SpiderMonkey 128.13.0 inside Dolly: blockers

Probed with the pinned `mozjs-128.13.0.tar.xz` (0 A.D.'s patches, which
include `FixPython3_14.diff`, plus `spidermonkey.patch`) in the
`llvm-tablegen` image (CMake with CPython 3.14.7):
`python configure.py --enable-project=js --disable-jit ... --disable-bootstrap`.
A native build of `src/slop.c` (four Dolly calls stubbed with `posix_spawn`)
ran the shell scripts outside the browser for quick checks.

- Python is not the problem: mach creates its virtualenv in Dolly's
  CPython 3.14 in about a second.
- mozbuild cannot name a wasm host. Without `--host` it runs config.guess;
  with `--host=wasm64-unknown-wasi` or `-emscripten`, `split_triplet`
  (init.configure:472) accepts WASI only for the target (`allow_wasi`):
  `ERROR: Unknown OS: wasi` / `Unknown OS: emscripten`. A host patch is
  needed; claiming Linux is not allowed.
- Slop: config.sub printed `unset: invalid name: -v`; config.guess stopped on
  `<<-`. After c0bf8c8 config.sub runs cleanly and config.guess stops on the
  missing `trap` and `umask` builtins. `js/src/old-configure` (autoconf 2.13,
  2,794 lines) parses and prints `--help`; a real run stops on
  `trap: command not found` before its first check.
- Rust: configure requires `cargo` (version check); the build runs
  `cargo rustc` for the `jsrust` static library and `cargo metadata`
  (`build/RunCbindgen.py generate_metadata`), and needs `cbindgen` (host
  build: 0.26.0 via `cargo install`). Dolly has rustc 1.98.1 (the seed that
  compiled `libjsrust.a` for the host build) but no Cargo. Patti builds only
  binaries as roots (`root_binary`: "select exactly one binary with --bin";
  `staticlib` fails "dynamic Rust libraries are not supported"); `jsrust` is
  `crate-type = ["staticlib"]` in a 672-package workspace lockfile with
  `[patch.crates-io]` path and git overrides.
- The C++ half compiles in Dolly. With the host build's configure output
  (generated headers, `Unified_*.cpp`, `js-confdefs.h`) and its compile
  commands minus emcc-only flags (`-matomics`, `-msimd128`, `-mthread-model`,
  `-gdwarf-4`, `-fno-sized-deallocation`, `-fno-aligned-new`,
  `-fno-math-errno`, `-fomit-frame-pointer`, `-ffp-contract=off`,
  `-ferror-limit=0`, `-fstandalone-debug`; `c++` rejects each today), all 158
  objects of `libjs_static.a` compile with `c++ -O2 -j3` in 320 s wall, 952 s
  summed, slowest TU 30 s, no failures and no Worker stack overflow. The
  engine linked against them (and the host `libjsrust.a`; 22,894,081 bytes)
  passes `0ad-engine-browser.mjs` with the same replay and save/load hashes:
  SpiderMonkey compiled by Dolly's `c++` runs the game identically.

Decision needed (owner): how Cargo-driven builds run in Dolly. Options: build
Cargo itself with Patti (heavy: curl, libgit2 and TLS sys crates); teach
Patti the Cargo subset mozbuild calls (`--version`, `metadata`,
`rustc --lib`); or build `jsrust` with Patti (after adding static-library
roots) and keep Cargo out of mozbuild with a build-system patch. The mozbuild
wasm-host patch and Slop's `trap` are needed in every case.

### Next

1. Owner decision on Cargo (above); then mozbuild's wasm host, Slop `trap`,
   and configure inside the `llvm-tablegen`-style Python image.
2. Content: build Naga with Patti and run `convert-shaders.py` and the
   packaging in Dolly's CPython; stage the release data as `.tar.gz` (Dolly
   has no `xz`).
