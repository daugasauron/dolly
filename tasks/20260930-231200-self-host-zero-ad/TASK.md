# Build 0 A.D. completely inside the userspace

- STATUS: OPEN
- PRIORITY: 270
- TAGS: demo,zero-ad,bootstrap

## Remaining (2026-10-07)

Everything in the `zero-ad` image except SpiderMonkey's archives is built by
Dolly's own tools (since 2026-10-02, below); the chain rebuilt in every
round since. Left: SpiderMonkey 128.13.0 inside Dolly, which needs mozbuild
to accept a wasm host, Slop's `trap` and `umask` in `config.guess`, and
Cargo driven by mozbuild (`20260930-231102-cargo-native`: its `libjsrust.a`
already builds with the packaged Cargo, 3 m 42 s); and the content (Naga for
the shaders, the data packaging) run in Dolly's CPython and Patti or Cargo.

Owner goal: the 0 A.D. engine, SpiderMonkey and its dependencies must be compiled inside Dolly instead of by demos/zero-ad/toolchain on the host.

## SpiderMonkey built inside Dolly, 2026-10-07 09:26 (headline)

In a headless-Chrome session on `default` + `amy install python rust cargo
cbindgen curl`, SpiderMonkey 128.13.0 configured, compiled and linked entirely
inside Dolly, and the engine's probe, linked against the Dolly-built libraries,
ran: `spidermonkey: wasm64 realms, GC, callbacks and clone passed`, exit 0.
Nothing came from the host. Stage timings and scope memory (6 GB browser slot,
cgroup v2 memory.peak, file cache included):

| Stage | Time | Peak |
| --- | --- | --- |
| unpack (537 MB, 29,594 files) + patches + pkgconf | 16-34 s | 3.1 GB |
| cbindgen 0.26.0 (Patti `-j4`) | 171 s | 3.9 GB |
| mozbuild `configure.py` (+ config.status, 3 backends, 34 Makefiles) | 41 s | 4.2 GB |
| Rust library `libjsrust.a` (cargo, build scripts + 59 units) | 205 s | 4.3 GB |
| C++ compile (js/src, mfbt, mozglue, fdlibm: ~240 objects) | ~6 min | 4.3 GB |
| style/libs/tools tiers; full `make` exit 0 | — | — |

Artifacts: `libjs_static.a` 21.4 MB, `libjsrust.a` 5.1 MB (the host build's
are 406 MB and 24 MB: it compiled with `-gdwarf-4` and `-C debuginfo=2`; this
build omits debug info, which the engine does not need). Evidence (not
committed) under `build/spidermonkey-evidence/`: per-stage logs
(`stage-*.log`), the edit scripts, the probe log, memory samples.

Committed on `work/spidermonkey` (`9fa4b4d3`): the recipe
`demos/zero-ad/Dollyfile-zero-ad-spidermonkey`, `demos/rust/Dollyfile-cbindgen`,
the consolidated `demos/zero-ad/toolchain/spidermonkey.patch`, the staging in
`demos/zero-ad/prepare-sources.sh`, and `zero-ad-engine` taking `/opt/mozjs`
by `COPY`. Seed pieces for round 3: `core/cc-flags` `9034916a` (eight Clang
flags), `core/touch-t` `b97bddd3` (`touch -t`), both merged into
`integrate/round3` `35668d93`. The recipe assumes round 3 (cc-flags, `touch
-t`, the Slop `${1+"$@"}` fix 2de376bd, Cargo+Python in the chain) and is
committed unbuilt; `build-spidermonkey.sh` and the bootstrap rows stay until
it builds once there.

### The mozbuild preparation edits (all in spidermonkey.patch)

Each is a fact about Dolly, with its reason as an added comment. "Upstream?"
says whether upstream mozbuild could take it.

1. `init.configure`: a Wasm host (`split_triplet(..., allow_wasi=True)` on the
   `config_sub` path), so `--host=wasm64-unknown-wasi` is accepted. Upstream:
   plausibly, WASI-host is a real cross case.
2. `old.configure`: `check_prog("M4", allow_missing=True)` and a loud `die` if
   a refresh is attempted; the release ships `old-configure`, Dolly has no m4.
   Upstream: yes, m4 is only needed to regenerate.
3. `cargo-linker`: `os.execvp` -> `sys.exit(subprocess.call(...))` (Dolly has
   no exec) and shebang `/usr/bin/env python3` -> `/usr/bin/python3` (Dolly's
   env is `/bin/env`). Upstream: the subprocess form, yes; the shebang is
   Dolly-specific.
4. `js/src/old-configure`: drop `-mthread-model single` for `*-wasi*` (Dolly
   probes `-pthread` on, and cc refuses the pair). Upstream: no, Dolly-specific.
5. `moz.configure`: `allow_missing=True` on llvm-objdump, readelf, objcopy,
   strip (a static JS build runs none; `check_binary` skips non-ELF). Upstream:
   yes for a compile-only toolchain.
6. `rust.configure`: the rust *host* triple also takes the `RUST_TARGET`
   override (Dolly's target is a target file rustc knows only by path).
   Upstream: same shape as the existing target override.
7. `mozboot/util.py`, `mach/logging.py`: lazy `import ssl` / `import blessed`
   (Dolly's CPython has no `_ssl`/`_curses`; TLS is the browser's). Upstream:
   yes, these imports are used only on network/colour paths.
8. `mozinfo.py`: name the Dolly platform (`system == "Dolly"` -> unix), so
   `os_version` is a string, not the `unknown` sentinel. Upstream: yes.
9. `frontend/reader.py`: create the gyp `ProcessPoolExecutor` lazily (Dolly's
   CPython has no named semaphores; a JS build has no gyp). Upstream: yes, a
   lazy pool is harmless.
10. `double-conversion/utils.h`: add `__wasm64__` to the supported-arch list
    (the same one-line addition `zero-ad-deps` makes to ICU's copy). Upstream:
    yes.
11. `mfbt/RandomNum.cpp`: take the `getrandom` path under `__dolly__`, not only
    `__EMSCRIPTEN__` (programs built in Dolly define `__dolly__`). Upstream: no,
    `__dolly__` is Dolly's.
12. `third_party/rust/jobserver`: the vendored 0.1.25 uses the in-process
    backend under wasm64 (Dolly has no `pthread_kill` and no cross-process
    jobserver), with its `.cargo-checksum.json` updated. Upstream: it already
    has a wasm backend; this only extends the `cfg`.

### Dolly gaps found (recorded; round 3 carries the fixes)

- Slop refused `${1+"$@"}` / `VAR="$@"` in a word (old-configure's compiler
  caching). Fixed on round 3 by `2de376bd`.
- `touch` had no `-t`. Added as `core/touch-t` `b97bddd3`; the recipe then
  needs no autotargets.mk workaround.
- `/usr/bin/env` does not exist (only `/bin/env`); handled by the cargo-linker
  shebang edit. A `/usr/bin/env` -> `/bin/env` symlink in the base would be the
  general fix.

### What `build-spidermonkey.sh` still does that the recipe does not

Nothing for SpiderMonkey: the recipe builds the same two libraries and the 328
headers from the same pinned tarball and patches. The only deliberate
difference is debug info (the host build keeps DWARF; the recipe builds without
it: 21.4 vs 406 MB, 5.1 vs 24 MB). The host script and the `mozjs-host.tar.gz`
(115 MB) / `bootstrap.tar` (151 MB) rows stay until the recipe builds once on
round 3; then `build-spidermonkey.sh` and `spidermonkey.sh` are deleted.

### Is the Dolly-built library a drop-in for the engine? (the integrator's question)

Yes. `zero-ad-engine` recompiles `pyrogenesis` in its own image against
`/opt/mozjs/include` and links `/opt/mozjs/lib`, so headers and library always
come from one build; the engine never links pre-built objects against a
foreign library. The probe (a mini-engine TU: realms, GC, callbacks,
structured clone) compiled against the Dolly-built headers and linked the
Dolly-built `libjs_static.a` + `libjsrust.a`, and ran, which is the engine's
pattern at small scale. The JS API in `dist/include` is generated from the
same source and the same `--disable-jit --disable-shared-js --without-intl-api
--disable-jemalloc` options, so `js-config.h`/`js-confdefs.h` carry the same
feature set and the engine's `-D` set is unchanged.

Two deliberate differences from the host build, neither affecting ABI or
linkability:
- No debug info (`--disable-debug-symbols`, no `-C debuginfo=2`): 21.4 vs
  406 MB, 5.1 vs 24 MB. Smaller, same symbols.
- No `-msimd128`: the host passed `--enable-optimize='-O2 -msimd128'`, the
  recipe `-O2`. SpiderMonkey's JS is then compiled without wasm SIMD. This is
  not a correctness or determinism difference (0 A.D.'s simulation is
  fixed-point, and the 2026-10-02 C++-only build that dropped `-msimd128`
  gave bit-identical replay and save hashes); it is at most a JS-execution
  speed difference for the Petra AI. Round 3's `cc` now accepts `-msimd128`
  (maps to `+simd128`), so matching the host is a one-token change to
  `--enable-optimize` once the recipe has built once as verified (`-O2`).

So `zero-ad-engine` can rebuild on the Dolly-built library today without any
engine source or flag change; the recipe already points `-I`/`-L` at
`/opt/mozjs`. Whether to rebuild it today is the integrator's call.

### `-j` above 1

mozbuild's recursive sub-makes print "jobserver unavailable: using -j1" because
Dolly has no cross-process jobserver (pipe tokens); the top-level `make -j4`
parallelises the tiers but each recursed C++ compile runs serially, which is
most of the wall time. Cargo's own `cc`-crate C++ parallelism uses the
in-process jobserver (the patched crate), so the Rust half is already parallel.
Real `-j>1` for the js/src C++ needs either a cross-process jobserver in Dolly
or mozbuild's `+`-prefix propagation extended past cargo.

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

### Session 1 (headless Chrome, `default` + `amy install python rust curl`, 07:58-08:10)

The `cargo` image could not be rebuilt under the 6 GB build cap (two OOM
kills in its last crate, 07:34 at 5.95 GB RSS and 07:45 at the cap; its pin
had moved with the Rust linker adapter), so the session is `default` with
the packages amy installs; the integrator opened a 9 GB `bigbuild` slot for
`cargo` once release packaging is done (about 08:20). Driver:
`build/spidermonkey-evidence/drive.mjs` (control port 38811); the scope's
memory sampled every 2 s into `memory-4.log`; stage logs `stage-*.log`.

- Staging: the tree must be packed by `scripts/build-source-tar.mjs`.
  GNU tar's default format writes `././@LongLink` entries, which Dolly's
  `tar` rejects ("validate path ... errno 138"); the script's archive paths
  are limited to 255 bytes anyway (longest here: 149). 537 MB, 29,594 files,
  packed in 1.5 s on the host, unpacked in 34 s in the session, 2.7 GB of
  scope memory afterwards. Every file gets the archive's fixed mtime, so
  `old-configure` is as new as `old-configure.in` and mozbuild does not
  refresh it (the m4 question is moot for a staged tree).
- `patch` is not in `default`, `posix` or `rust` (it comes with
  `system-tools` and `git`); the preparation patch was applied on the host
  before packing for this session; `zero-ad-deps`'s base has it.
- pkgconf from the deps sources, one `cc` line, 2 s; `zlib.pc` written;
  `pkg-config --modversion zlib` answers 1.3.2.
- configure (`stage-2-configure-1.full.log`, 3.2 s): mach's state directory
  and virtualenv created; "checking for a shell... /bin/sh" (Slop);
  `config.sub` under Slop canonicalises `wasm64-unknown-wasi` for host and
  target (the Wasm-host edit works); `rustc` found, version 1.98.1;
  "checking for cargo... not found" and then the bootstrap fallback for a
  missing tool imports `mozboot.util`, whose module-level `import ssl` has
  no `_ssl` in Dolly's CPython (TLS stays in the browser), so the traceback
  hides mozbuild's own "Cannot find cargo" message. Not a blocker once
  cargo is present; worth one lazy-import line if it ever is.
- cbindgen 0.26.0 by Patti from the staged archive, `-j 4`: 171 s, scope
  peak 3.93 GB, `cbindgen --version` prints 0.26.0. Patti first refused the
  libc override ("manifest/lock mismatch") because cbindgen's lock pins
  libc 0.2.144 while the SDK's crate is 0.2.186; the staging script now
  rewrites that lock line for cbindgen as it does for ripgrep and fd.

### The recipe's inputs, decided 08:20-08:27 (uncommitted until the chain builds)

- `demos/zero-ad/Dollyfile-zero-ad-spidermonkey`: build-only toolchain
  `FROM zero-ad-deps` (pkgconf, `zlib.pc`, the C++ toolchain, `patch`),
  `INSTALL python`, `INSTALL cargo` (brings `rust`), `INSTALL cbindgen`;
  one `build.slop` (patches, configure, `make -j4`, the copy into
  `/opt/mozjs/{include,lib}` and the licences into
  `/usr/share/licenses/spidermonkey`, crate notices included);
  `FOLDER /opt/mozjs`. `zero-ad-engine` takes both trees by `COPY` and its
  `mozjs-128.pc` and probe point at `/opt/mozjs`; `zero-ad` already copies
  the licence directory from the engine. The two `SOURCE`s of the exception
  (`mozjs-host.tar.gz` 115 MB, `bootstrap.tar` 151 MB) go away.
- Source staging in `demos/zero-ad/prepare-sources.sh`: the pristine
  `mozjs-128.13.0.tar.xz` from the already-staged 0 A.D. tree, extracted
  without `js/src/tests`, `js/src/jit-test` and `testing/web-platform`
  (490 MB that `--disable-tests` never reads; 625 MB stay, of which
  `third_party/rust` 398 MB: Cargo resolves the whole vendored workspace, so
  it cannot be pruned), 0 A.D.'s `patches/` and `spidermonkey.patch`, packed
  by `build-source-tar.mjs` into `zero-ad-build/mozjs.tar.gz` (161 MB).
  Both patch sets are applied in the image by `sh ../patches/patch.sh` and
  `patch -p1`, verified in order on the host.
- `spidermonkey.patch` carries the four preparation hunks (Wasm host,
  `allow_missing` M4 plus a loud `die` if a refresh is ever attempted, the
  linker wrapper's `subprocess.call`, the `*-wasi*` `-mthread-model single`
  line dropped from the shipped `old-configure`).
- The recipe writes `CC='cc -D__wasi__'` and assumes `core/cc-flags`
  (round 3); this tree's `cc` lacks the four flags, so the session and any
  image build here use the filtering wrappers instead, which is the only
  difference between what is verified today and the committed text.

### Image builds on the round-3 base (2026-10-07, `work/cargo` after the import)

- `cbindgen`: built at 10:12 in about 2.5 min (slot opened 10:09:56; Patti
  `-j4`, 33 packages), snapshot 4,405,434 bytes; `reusing published rust-build
  artifact`, nothing imported was rebuilt. Scope peak over cbindgen plus the
  start of the next image: 6.6 GB (the same Patti build peaked 3.9 GB in a
  session).
- `zero-ad-spidermonkey`'s closure then pulls `cmake-build` -> `cmake` ->
  `openal-build` -> `zero-ad-deps` first (none imported; deps needs cmake).
- First `zero-ad-spidermonkey` image build (10:59) failed 18 s into configure:
  `checking for libclang for bindgen...` runs `c++ -print-search-dirs`, which
  Dolly's cc refuses (it knows `--print-search-dirs` only). The session had
  passed because the session-only compiler wrapper translated that spelling;
  that workaround was never a patch hunk. Fix at mozbuild's level: the recipe
  passes upstream's `--with-libclang-path=/usr/lib`, which skips the probe and
  globs the directory for libclang; Dolly has none, so "not found", which a
  standalone JS build tolerates (bindgen is required only for browser/android
  projects). Gap noted: cc's single-dash `-print-search-dirs` (GNU/Clang
  spelling) is refused; only bindgen-style tooling asks for it, and such ports
  would need libclang itself, so no seed change is requested.
- Round 3's cc forwards `-fstandalone-debug` and `-ferror-limit=N` to cc1 in
  the driver's spelling, which cc1 refuses (`9034916a`'s translation is
  wrong: Clang's driver emits `-debug-info-kind=standalone` only with `-g`,
  and `-ferror-limit N` as two arguments). `-ferror-limit=0` reaches no real
  compile here (only the clangd database), `-fstandalone-debug` comes from
  `js/src/moz.build` for every clang build; one more patch hunk adds
  `and CONFIG["MOZ_DEBUG_SYMBOLS"]` (the flag only widens debug info, so it
  is inert without `-g`; upstream could take it). The cc translation fix is
  listed under remaining.

### Remaining (as of 11:20)

- `core/cc-flags` `7dbf0f38` (unbuilt, for the next round): `-fstandalone-debug`
  and `-ferror-limit=N` translated as Clang's driver does (no cc1 argument
  without `-g`; `limited` for the negative under `-g`; `-ferror-limit N` as
  two arguments), suite case with all seven flags plus a `-g
  -fstandalone-debug` compile. Until it lands, the patch's `js/src/moz.build`
  hunk keeps `-fstandalone-debug` out of a build without debug symbols.
- `cc -print-search-dirs` (single dash) is refused; only bindgen asks, and
  such ports need libclang, which Dolly lacks: no seed change requested.
- `build-spidermonkey.sh`, `spidermonkey.sh` and the bootstrap rows in
  `demos/zero-ad/README.md` and `docs/sources.md` are deleted once the
  `zero-ad-spidermonkey` image has built and `zero-ad-engine` has rebuilt
  against it (the integrator's call).
- `-msimd128` to match the host's optimize flags: one token in the recipe
  after the first verified build.
- Second image build (11:17-11:30): configure, the Rust library and all C++
  compiled and `libjs_static.a` was archived (742 s to the archive, scope
  peak 7.33 GB under the 9 GB bigbuild slot), then the misc tier's
  `check_spidermonkey_style.py` failed: the staged `mozjs.tar.gz` had no
  `js/src/tests/style` because `prepare-sources.sh` reused the tree extracted
  by the first (all-of-`js/src/tests`) pruning. Staging now re-extracts every
  time (5 s); the fixtures are in the tarball; the recipe lists
  `/opt/mozjs/lib` so the image log carries the library sizes.
- **`zero-ad-spidermonkey` built** (third image build, 11:34:43-11:49:24,
  `work/slot.sh bigbuild`, round-3 base, `cbindgen`, `zero-ad-deps`, `python`
  and `cargo` reused): `build.slop` 756 s, image 879.4 s with the 795,577,904
  byte snapshot export; `libjs_static.a` 21,428,434 bytes and `libjsrust.a`
  5,140,674 bytes (the host-built ones: 406,352,974 and 24,145,424 with
  DWARF). Scope memory reached the 9 GB bigbuild cap (cgroup v2 peak, file
  cache included: the 537 MB tree and the 796 MB export are in it; no kill,
  the kernel reclaimed cache); the previous run peaked at 7.33 GB before its
  export stage; the same build in a session peaked at 4.3 GB. The
  bootstrap exception is replaced in the recipe graph; `build-spidermonkey.sh`
  and the doc rows go once `zero-ad-engine` has rebuilt against `/opt/mozjs`.

### Image build stages, sizes, and what the engine rebuild unlocks (11:52)

Stage times and scope peaks of the `zero-ad-spidermonkey` image build on the
round-3 base (bigbuild slot, 9 GB cap, cgroup v2 peaks with file cache):
unpack + patches, configure (with the three backends) and the Rust library in
the first ~4 min, C++ to the `libjs_static.a` archive at 742-756 s, misc tier
(style check, `js-config`, `js.pc`) and the copy into `/opt/mozjs`, then the
796 MB snapshot export to 879 s. Peaks: 7.33 GB through the archive (build 2),
the 9 GB cap during the export (build 3, cache reclaimed, no kill); the same
work in a session peaked at 4.3 GB. `cbindgen`: 2.5 min, 4.4 MB.

Library sizes, Dolly-built against host-built: `libjs_static.a` 21,428,434 B
against 406,352,974 B, `libjsrust.a` 5,140,674 B against 24,145,424 B. The
difference is DWARF: the host build compiled with `-gdwarf-4` and
`-C debuginfo=2`, the recipe with `--disable-debug-symbols` and no Rust
debuginfo; the code and exported symbols are the same build options
otherwise (minus `-msimd128`, above).

To delete once `zero-ad-engine` has rebuilt against `/opt/mozjs` and
`0ad-spidermonkey`, `0ad-engine` and `0ad-graphics` pass on it (nothing is
deleted yet):

- `demos/zero-ad/toolchain/build-spidermonkey.sh` (the host driver),
  `toolchain/spidermonkey.sh` (the container build), `toolchain/prepare.sh`
  (the host staging: 0 A.D. tarball unpack, native Rust bootstrap, cbindgen,
  m4/pkg-config copies, the wasm64 std build, zlib; used only by
  `build-spidermonkey.sh`), `toolchain/rustc.sh` (used only by
  `spidermonkey.sh`) and `toolchain/rust-bootstrap.toml` (used only by
  `prepare.sh`). `toolchain/spidermonkey.patch` stays: the recipe applies it.
- `demos/zero-ad/README.md`: the "SpiderMonkey is still cross-compiled
  outside Dolly, an explicit bootstrap exception" sentence (lines 5-7) and
  the `bash demos/zero-ad/toolchain/build-spidermonkey.sh` line of the Build
  section (line 24).
- `docs/sources.md` lines 30-31: "0 A.D.'s SpiderMonkey" among the demo
  exceptions and "SpiderMonkey" among the externally built programs.
- `docs/licences.md` lines 21 and 88-91: SpiderMonkey as a file built
  outside Dolly and the `mozjs-host.tar.gz` / `bootstrap.tar` description
  (the licence texts now come from the image's `/usr/share/licenses/spidermonkey`).
- `dist/static/zero-ad-build/mozjs-host.tar.gz` (115 MB) and `bootstrap.tar`
  (151 MB): no recipe reads them and staging no longer writes them.
- The host caches under `.cache/0ad/`: `…/mozjs-128.13.0/obj-dolly` (1.1 GB),
  `toolchain` (1.4 GB, the native Rust bootstrap), `rust-target` (291 MB),
  `cargo-home` (86 MB), `host-tools`, `sysroot`, `zlib`, `mozbuild-state`.
  `DOLLY_EMSDK_IMAGE` in `config/source-pins.sh` stays if anything else uses
  the emsdk container; check before removing.

### `zero-ad-engine` rebuilt against the Dolly-built SpiderMonkey (11:51-11:58)

Built on the round-3 base through the bigbuild slot, reusing `zero-ad-deps`
and copying `/opt/mozjs` (341 + 149 paths) from `zero-ad-spidermonkey`:
image 409.1 s, `make config=release -j4 pyrogenesis` 315 s, snapshot
488,765,730 bytes. The in-recipe probe linked against `/opt/mozjs` printed
"`spidermonkey: wasm64 realms, GC, callbacks and clone passed`" and `pyrogenesis -version` ran. Scope memory: samples up to
8.94 GB current, cgroup peak at the 9 GB cap (file cache, no kill). No
engine source or flag changed: the library is the drop-in the analysis
above predicted. `zero-ad` itself is the integrator's build (its builder
needs more than 9 GB); the three 0 A.D. browser tests follow on it.

### 0 A.D. on the Dolly-built SpiderMonkey: green, and the host bootstrap deleted (12:06)

`zero-ad` built on the rebuilt engine in 279 s (the integrator, 18 GB scope,
`build/spidermonkey-evidence/zero-ad-on-dolly-mozjs.log`). The three browser
tests, logs `build/spidermonkey-evidence/test-0ad-*.log`:

- `0ad-spidermonkey` exit 0: "spidermonkey: wasm64 realms, GC, callbacks and
  clone passed", shell survived.
- `0ad-engine` exit 0: "Control protocol: 69 entities, save/load hash
  ff2fbc7d000708ab8b70ed0eaec257df, unit 11 moved" (the hash the host-linked
  engine gave on 2026-10-01: the simulation is bit-identical), economy, Petra
  and fresh-process save/load in 17,232 ms.
- `0ad-graphics` (hardware, `nvidia blackwell`, Chromium 151) exit 0: combat
  scene ready in 1,849 ms.

Image times on the round-3 base: `cbindgen` 2.5 min, `zero-ad-spidermonkey`
879 s, `zero-ad-engine` 409 s, `zero-ad` 279 s.

Deleted in one commit: `demos/zero-ad/toolchain/{build-spidermonkey.sh,
spidermonkey.sh, prepare.sh, rustc.sh, rust-bootstrap.toml}`, the bootstrap
sentences in `demos/zero-ad/README.md`, `docs/sources.md` and
`docs/licences.md` (SpiderMonkey is no longer a file built outside Dolly;
`mozjs-host.tar.gz` and `bootstrap.tar` are no longer described). Repin
changed no recipe (no recipe pins those documents); lint, the source suite
(333) and the upstreams test pass. The `.cache/0ad` host caches are outside
git and untouched. The bootstrap exception named in this task's goal is gone:
done when the checkpoint carries this branch.

- STATUS: DONE when merged (integrator's checkpoint, 13:15).
