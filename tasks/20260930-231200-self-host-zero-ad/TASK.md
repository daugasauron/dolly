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
  Firefox. The engine recipe sets `SOURCE_DATE_EPOCH=1771228448` (the
  release's `build_version.txt` mtime); built on a runtime with this commit
  (`work/zero-ad-verify`, chain 2,450 s, `make` 280 s) the engine embeds only
  `Feb 16 2026 07:54:08`. A second build for a byte comparison was not run.

### Merged with Dollyfile 6 Phase 3 (2026-10-02 morning)

`main` (`e30c0b0`) merged into `work/zero-ad-self` (4e28ebc): `zero-ad-deps`
and `zero-ad-engine` are `DOLLY 6` toolchains with their complete host sets
(the deps image keeps the OpenAL probe, so it declares `audio@0`; the engine
image adds `gpu@0`), `openal.dm`'s `HAVE_PTHREAD=OFF` lives in
`Dollyfile-openal-build`, `zero-ad` takes the engine with `COPY` (the
template in `prepare-distribution.mjs` writes the same line), staging uses
`has_image`. `0ad-graphics-browser.mjs` reads `Dollyfile-zero-ad`
(`zero-ad.dm` is gone). On the merged runtime (`12a4a4d7…`, seed with `-MP`,
`SOURCE_DATE_EPOCH` and the Slop changes) `test/core-browser.mjs`,
`cpp-browser.mjs`, `slop-browser.mjs` and `shell-browser.mjs` pass in Chrome
and Firefox.

`DOLLY_IMAGE_JOBS=4 DOLLY_BUILD_IMAGES=zero-ad npm run image` rebuilt the
whole chain on that runtime in 3,324 s (load about 6): deps build script
244 s, `make -j4 pyrogenesis` 380 s, the SpiderMonkey probe passes during the
build; snapshots: `zero-ad-deps` 427,532,277 B, `zero-ad-engine`
458,292,833 B, `zero-ad` 2,076,204,879 B. Phase 3 enables only the host
modules an image declares, and `default` declares neither `audio@0` nor
`gpu@0`, so the engine (which stamps both) fails there with "Required host ABI
audio@0 is unsupported". `0ad-engine-browser.mjs` and the headless
`0ad-multiplayer-browser.mjs` now open the `zero-ad-engine` toolchain, which
declares both, with Chrome's software WebGPU adapter. All pass:
`0ad-spidermonkey-browser.mjs`, `0ad-openal-browser.mjs`,
`0ad-enet-browser.mjs`, `0ad-engine-browser.mjs` (replay state
`be99497b21b9cb86d3a1478d2e2e09a6` again), `0ad-multiplayer-browser.mjs`
(149 turns, hash `f3dd66c38dd8ab65aafdbdfe020a56d9`) and
`0ad-graphics-browser.mjs zero-ad hardware` (Xvfb `:123`, boot 31.6 s, 25 ms
per frame, economy, quick save/load, shell recovery).

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
  missing `trap` and `umask` builtins. `trap` only prints an error there;
  `umask` is what fails, because every temporary-directory fallback runs
  `(umask 077 && mkdir ...)`. A Slop `umask` alone would not be honest: the
  process libc only stores the mask (`__syscall_umask` in
  `src/process/libc-adapter.c`), nothing applies it to created files, and
  spawning does not carry it to the `mkdir` a script starts. `js/src/old-configure` (autoconf 2.13,
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

1. SpiderMonkey (Cargo decided below): mozbuild's wasm host and Slop's
   `trap`/`umask` first, then configure inside a CMake-plus-Python toolchain,
   then Cargo built in Dolly (`20260930-231102-cargo-native`).
2. Content: build Naga with Patti and run `convert-shaders.py` and the
   packaging in Dolly's CPython; stage the release data as `.tar.gz` (Dolly
   has no `xz`).

## Decision (2026-10-02, integrator)

SpiderMonkey's Cargo steps: build upstream Cargo inside Dolly over its libcurl
(`20260930-231102-cargo-native`) instead of teaching Patti Cargo subcommands or
patching Cargo out of mozjs. Unchanged upstream tools over a deliberate
substrate is the porting rule; a Patti that grows Cargo's metadata and library
commands becomes a second Cargo. The configure patch for a wasm host and Slop's
`trap`/`umask` are independent and come first.

## Map of the host SpiderMonkey build (2026-10-07 07:30, branch `work/spidermonkey`)

What `toolchain/build-spidermonkey.sh` does (`prepare.sh` on the host, then
`spidermonkey.sh` in the emsdk container, then the staging in
`prepare-sources.sh`), and where each step stands inside Dolly. "Verified"
names who measured it; everything else was established by reading mozjs
128.13.0's `build/moz.configure/*`, `config/makefiles/rust.mk`,
`config/rules.mk`, the host object directory (`.cache/0ad/.../obj-dolly`,
1.1 GB) and `src/compiler.cpp`. No log of the host build survives (the
container wrote none to the cache).

| # | Host step | Inside Dolly |
| --- | --- | --- |
| 1 | Fetch 0 A.D. 0.28.0, unpack `mozjs-128.13.0.tar.xz`, apply 0 A.D.'s seven `patches/*.diff` and `toolchain/spidermonkey.patch` | Staging, as every demo source: Dolly has no `xz`, so the host repacks the pinned tree as `.tar.gz` (`prepare-sources.sh` convention); `patch` and `tar` exist in Dolly (engine.patch is applied in-image today). Untried only in the sense that no recipe does it yet. |
| 2 | Install the native Rust bootstrap, build the wasm64 `std` with `-Zbuild-std`, patch `libc` | Done: the `rust` package (seed rustc 1.98.1, SDK with the target's `std`), verified by the Cargo agent. |
| 3 | `cargo install cbindgen 0.26.0` (host-native binary, version checked by `bindgen.configure`) | Verified in Dolly by the Cargo agent (2026-10-06, 2 m 51 s through the crates.io relay; `cbindgen --lang c` output correct). Offline, for an image: untried. Needs a staged source like `Dollyfile-ripgrep` (Patti from locked crate archives) or `cargo install --offline` from a vendored directory. Only `js/src/frontend/smoosh` uses cbindgen at build time, and only with `--enable-smoosh`; configure still refuses to run without it. |
| 4 | Copy the host's `m4` and `pkg-config` binaries into the container | `m4`: missing in Dolly. `old.configure` runs `check_prog("M4")` unconditionally but uses m4 only to regenerate `js/src/old-configure` from `old-configure.in` when the latter is newer; the release ships `old-configure`. Blocked by one preparation edit (`allow_missing=True`, loud failure if a refresh is ever attempted) or an m4 port. `pkg-config`: pkgconf is built in `zero-ad-deps` (verified in that image's build). |
| 5 | zlib: `./configure --static; make install` into a sysroot, so `pkg-config zlib` answers | Done: system `libz.a`/`zlib.h`; `zero-ad-deps` writes `zlib.pc`. mozbuild's standalone default is `--with-system-zlib` through pkg-config. Untried through mozbuild. |
| 6a | `configure.py`: mach virtualenv | Verified 2026-10-02 (self-host agent) in Dolly's CPython 3.14: about a second. |
| 6b | configure: shell and host. `sh`, then without `--host` `config.guess`; with `--host` `config.sub` then `split_triplet` | `config.guess` is blocked twice: Slop refuses `umask` ("Dolly has no permission bits", every temp-dir fallback is `(umask 077 && mkdir …)`) and it cannot name Dolly. With `--host=wasm64-unknown-wasi`: `config.sub` is a plain script (ran under native Slop in the configure survey); `split_triplet` rejects a WASI host (`allow_wasi` is target-only; verified 2026-10-02: "Unknown OS: wasi"). Blocked by a preparation edit in `init.configure` (a Wasm host for the js project). Host == target then makes mozbuild treat the build as native, so `nsinstall` and the Rust build scripts use the same `cc`/`rustc`. |
| 6c | configure: compiler identification and flag probes (`toolchain.configure`, `flags.configure`, `old-configure.in`) | Identity: mozbuild preprocesses a probe and compares `__wasi__`/`__wasm64__` with the triple; on a mismatch it appends `--target=…`, which Dolly's `cc` rejects, so `CC='cc -D__wasi__'` stays exactly as the host build spells it (mozbuild knows no Dolly OS; `cc -dumpmachine` says `wasm64-unknown-dolly`). Probed flags that `cc` rejects are simply dropped (`-fno-sized-deallocation`, `-fno-aligned-new`, `-pthread` is accepted). Four flags are added without a probe and `cc` rejects each (`src/compiler.cpp` option table; the 2026-10-02 probe compiled with them removed): `-fno-math-errno` (`flags.configure`), `-fomit-frame-pointer` (`MOZ_FRAMEPTR_FLAGS`, optimized builds), `-ffp-contract=off` (`frontend/context.py`, every compile), `-mthread-model single` (`old-configure.in`, `*-wasi*`). Two more are avoided by options: `-gdwarf-4` (`--disable-debug-symbols`), `-msimd128` (the host passed it in `--enable-optimize`). All four are no-ops for this target (wasm has no frame pointer, clang's wasm toolchain defaults to no math errno and a single thread model, wasm has no FMA to contract) and clang's cc1 accepts each; the honest fix is `cc` accepting them (core, seed change) rather than four one-line edits in mozbuild. Decision for the integrator. Linker: `select_linker` tries `-fuse-ld=lld` (rejected) and then no flag with `-Wl,--version`, which `cc` answers; untried. |
| 6d | configure: Rust (`rust.configure`) | `cargo --version --verbose` parses, `cargo +stable` exits 101 as expected, `cargo metadata` of `js/src/rust` returns the 70 packages (verified by the Cargo agent). `RUST_TARGET=wasm64-emscripten-probe` override is in `spidermonkey.patch`. `assert_rust_compile` through mozbuild: untried. |
| 6e | configure: `old-configure` (autoconf 2.13, 2,794 lines, under `sh`) | 2026-10-02 it stopped at `trap: command not found`; Slop has `trap` since `ffef482a` (in this tree's builtin table). Uses `exec 5>./config.log`, `exec 6>&1` (redirection-only exec), `eval`, here-documents, and runs its conftest programs with `cc`, which Dolly can execute (so `cross_compiling=no`, unlike the host build). Untried since. |
| 6f | configure: `config.status`, the build backends (RecursiveMake, FasterMake, Clangd) reading every `moz.build` | Pure Python plus file writes; untried. |
| 7a | `make`: export tier. `install_dist_include` symlinks 328 headers into `dist/include` (`mozpack`, hard link or copy fallback), `system_wrappers` (one generated wrapper per header of `config/system-headers.mozbuild`), 15 Python `GeneratedFile`s (`js-confdefs.h`, `js-config.h`, `selfhosted.out.h`, `ReservedWordsGenerated.h`, `jit/*OpsGenerated.h`, …), `buildid.h`, the host program `config/nsinstall` (C, with `HOST_CC`) | Untried. Make is Dolly's GNU Make; mozbuild's recursive Makefiles rely on `MAKEFLAGS`, `$(shell)`, `.SECONDEXPANSION` and the jobserver `+` prefix for cargo. |
| 7b | `make`: compile tier, C and C++: about 240 objects (157 in `libjs_static_a.list`, fdlibm 57, mozglue 14, mfbt 7, memory 2, config 2, `pure_virtual` 1), unified sources | Verified 2026-10-02 (self-host agent) outside mozbuild: the 158 `libjs_static.a` objects compile with `c++ -O2` in 320 s wall at `-j3` (952 s summed, slowest TU 30 s), the engine linked against them passes `0ad-engine-browser.mjs` with identical replay and save hashes. Memory per compile not measured. Untried: driven by mozbuild's Makefiles with mozbuild's own flags (the four rejected flags above are among them). |
| 7c | `make`: compile tier, Rust: `cargo rustc --release --manifest-path js/src/rust/Cargo.toml --lib --target wasm64-emscripten-probe` with `RUSTFLAGS='-C debuginfo=2 --cap-lints warn -C codegen-units=1'`, `CARGO_TARGET_DIR=obj/`, the vendored `third_party/rust` (345 MB, `.cargo/config.toml` written by configure), and `build/cargo-linker` as `CARGO_TARGET_*_LINKER` for build scripts and procedural macros | Verified by the Cargo agent outside mozbuild: `libjsrust.a` in 3 m 42 s (37.7 MB with debuginfo; host build's 24.1 MB), 59 units, 8 build scripts, 6 procedural macros. `--frozen`, which failed half the runs, is not passed by mozbuild to a standalone JS build (`rust.mk`: `ifndef JS_STANDALONE`), so that instability does not apply. Blocked by `build/cargo-linker` (and `cargo-host-linker`): a Python script ending in `os.execvp`, and Dolly has no exec; one preparation edit (`subprocess.call` and `sys.exit`). |
| 7d | `make`: libs tier, `llvm-ar crs libjs_static.a` of the objects, plus `jsrust` and `mozglue` folded in by the patch's `USE_LIBS` (the host archive is 406 MB with DWARF; `libjsrust.a` is also shipped separately) | Dolly's `ar` knows `c r q s`. Untried. |
| 7e | `make`: `spidermonkey_checks` (three Python style checks), `js-config`, `js.pc` | Untried; nothing links. |
| 8 | Staging: resolve the 328 `dist/include` symlinks, copy `libjs_static.a` and `libjsrust.a`, collect SpiderMonkey's LICENSE, MPL-2.0 and every vendored crate's notice into `mozjs-host.tar.gz` (115 MB); publish `bootstrap.tar` (150 MB) as corresponding source | Replaced by `cp -RL` into the image and `FOLDER` lines; `bootstrap.tar` disappears with the exception. The engine recipe's `mozjs-128.pc`, `spidermonkey-check` and `--with-system-mozjs` stay as they are. |

Platform facts the map rests on: images here are at build id `4431ea80…`
(`default`, `cargo`, `rust-tools`); `python` and `zero-ad-deps` were stale
(`22d006ca…`), so `python` is being rebuilt through the build slot (started
07:15). The Rust and Python packages are `INSTALL`able; `zero-ad-deps` is a
toolchain, so pkgconf and `zlib.pc` come either from building `FROM` it or
from one `cc` line.

Recipe shape, decided now and revisited when the measurements are in: a
separate build-only toolchain `Dollyfile-zero-ad-spidermonkey` (`FROM
zero-ad-deps` for pkgconf, zlib.pc and the C++ toolchain; `INSTALL python`,
`INSTALL cargo`, which brings `rust`; a `cbindgen` package), and
`zero-ad-engine` takes `/tmp/mozjs` by `COPY` as `zero-ad-deps` takes SDL2.
Reasons: the engine needs only headers and two archives; the deps image
(229-461 s, 430 MB) should not carry Python, Rust and Cargo (about 700 MB)
for every rebuild; SpiderMonkey's patch changes should rebuild SpiderMonkey
alone; and the slot caps favour one heavy build per image.

Gaps, by kind:

- Missing platform features: `m4` (step 4); `exec` for `cargo-linker`
  (7c; a preparation edit, since `docs/process-model.md` has no exec);
  `cc` has no spelling for four cc1 options (6c); no `xz` (1).
- Upstream detects wrongly: a Wasm host in `init.configure` (6b).
- Slop: `umask` in `config.guess` (6b), avoided by `--host`; nothing else
  known before the stages run.
- Unknown until measured: peak memory of a mozbuild C++ compile at `-j4`
  under the 6 GB tab, the Cargo step under mozbuild, Make's jobserver, the
  mtime of the extracted `old-configure` against `old-configure.in` (Dolly's
  `tar` may give every file the extraction time, which would trigger the m4
  refresh: the recipe then `touch`es `old-configure`).

### Decisions, 07:35

- The four flags (integrator): `cc` learns them. Branch `core/cc-flags`
  from `integrate/next`, commit `9d21e987` (worktree `work/cc-flags`):
  `-fno-math-errno` and `-fomit-frame-pointer` are accepted as statements of
  what cc1 already gets for wasm, `-ffp-contract=` is forwarded after the
  default, `-mthread-model VALUE` is forwarded and refused (status 64) next
  to `-pthread`, as Clang's driver refuses it; one case in
  `test/cpp-browser.mjs`. Not compiled here (no native clang++; the
  compiler builds only in the container), so it is unverified until round 3's
  chain build. Today's session runs with a wrapper (`dolly-cc`, `dolly-c++`
  in `build/spidermonkey-evidence/serve/`) that drops the four flags and adds
  `-D__wasi__`; the recipe lands with round 3 and assumes the flags.
- Because mozbuild probes `-pthread` on and `old-configure` adds
  `-mthread-model single` for every `*-wasi*` target, the pair would be
  refused; the preparation patch (`sm-dolly-prep.patch`, four hunks, to
  become part of `spidermonkey.patch`) drops that line from the shipped
  `js/src/old-configure` (not `.in`, which would need the m4 refresh), with
  the Wasm-host, `allow_missing` M4 and `subprocess.call` linker edits.
- cbindgen as a Rust tool package: `demos/rust/Dollyfile-cbindgen`, Patti
  from `cbindgen.tar` staged by `prepare-rust-sources.py` (tag 0.26.0, 44
  locked crates, 12.5 MB), the SDK's `libc` as `--patch`; row in
  `config/upstreams.json`. Untested until the image builds.
