# Zig 0.17 across the board: zig, its LLVM, Ghostty's build and every image built with them

- STATUS: OPEN
- PRIORITY: 220
- TAGS: zig,toolchain,display,0.1.5

Owner (2026-11-03): "I think a new version of zig was released, I want you to upgrade to that
across the board."

Zig 0.17.0 was released on 2026-10-01 (ziglang.org's download index; master is
0.18.0-dev). Dolly pinned 0.16.0 (`config/source-pins.sh`: `DOLLY_ZIG_VERSION`, the host Zig that
fetches Ghostty's dependencies `DOLLY_ZIG_HOST_*`, and LLVM 21.1.8, "the version Zig 0.16 links").

What uses Zig (recipes naming it on 2026-11-03): `Dollyfile-zig`, `Dollyfile-zig-build`,
`Dollyfile-ghostty-build` (the terminal library every image's display holds, so the whole catalog
rebuilds), `demos/zig` (`zig-llvm`, `zig-llvm-build`), `demos/llvm` (`llvm21`,
`llvm21-tablegen`), `demos/ghostty-gtk/Dollyfile-ghostty-gtk`. `demos/zero-ad/Dollyfile-libsodium`
only names upstream's `build.zig` in a comment; it builds with `cc` and needs nothing.

Done when: every recipe that builds with Zig uses 0.17.0 (or the newest release then), the docs
and pins name it, nothing pins 0.16; the catalog is rebuilt in a round, and the terminal, zig's
own demo test and the images built with it pass their tests in Chromium and Firefox.

## State (2026-11-05 00:30 JST)

The upgrade is merged and on `main` (`ebffaaad8`, the round of 4 November): pins, patches, recipes
and docs name Zig 0.17.0, Ghostty v1.4.0 and LLVM 22.1.8, and the catalog was rebuilt with them.
`demos/ghostty-gtk` waits for Mesa's EGL (`tasks/20261103-110119-ghostty-egl`). The one item left,
`zig build`'s first run in a session (103 s on 0.17 against 13.5 s on 0.16 in the upgrade's
report), is explained and fixed on `zig/build-speed` in `work/zigperf` (section "zig build's first
run"): 0.17 compiles its maker and translator on first use, by design, and the `zig-llvm` package
now does that when it is built. Measured with the setup done by hand in a session: 17.0 s in
Chromium and 19.1 s in Firefox, against 95.6 s and 101.9 s. Left: the package built (a 9 GB slot,
so after the night round) and the demo test on it in both browsers.

## zig build's first run (2026-11-04/05 night, `work/zigperf`)

Evidence under `build/zigperf-evidence/` of `work/zigperf`: the measuring script
(`tools/measure.mjs`, one session, each command timed from Playwright), its step lists
(`steps-*.json`), logs, results and Chrome traces (CPU profiler only; `tools/trace-*.mjs` split
them), and the native runs (`native/`). The project is the demo test's: `build.zig` installing
`hello.zig`, which spawns `echo`. Zig 0.16 runs on v0.1.4's own runtime and images, served from
the published archive (`work/locks/published/v0.1.4`, `tools/serve-published.mjs`, read-only);
0.17 on this branch's runtime with the round's `zig-llvm` (image inputs `88959af6`).

### Measured

| Seconds | first `zig build` in a session | new project, global cache warm | rerun | `zig build-exe hello.zig` | first `zig translate-c` |
| --- | --- | --- | --- | --- | --- |
| 0.16, Chromium 156 | 25.9, 29.5, 30.8, 33.0, 33.5 | 19.2, 21.9, 23.9 | 0.8, 0.8 | 4.5, 5.5 | (in the compiler) |
| 0.16, Firefox 155 | 36.3, 42.3 | 27.9 | (killed) | | |
| 0.17, Chromium | 95.6 | 10.3 | 0.5 | 2.7 | 43.2 |
| 0.17, Firefox | 101.9 | 14.0 | | | |
| 0.17 with the setup done, Chromium | 17.0 | 11.5 | 0.6 | 2.9 | 0.6 |
| 0.17 with the setup done, Firefox | 19.1 | 15.4 | | | |
| 0.16, native x86_64, one core | 5.3 | 2.2 | 0.02 | 3.1 | |
| 0.17, native x86_64, one core | 72.2 (10.5 with `ZIG_DEBUG_CMD`) | 1.7 | 0.01 | 3.7 | 52.8 |

"With the setup done": in the session, the package's new recipe steps by hand (`zig init
--help`, `zig translate-c` of an empty header, the `rm`), the cache copied (`cp -r`: new inodes
and modification times, as an install gives), then the same steps as before. In 0.17 the first
`zig init --help` alone took 81.5 s (76.9, 98.7 s in later sessions; Firefox 90.6, 96.7 s), the
first `zig translate-c` after it 43.2 s (39.9, 49.3; Firefox 47.7, 49.3), and a first `zig
build` with `ZIG_DEBUG_CMD` 46.9 s. The same maker compile natively (host Zig 0.17, the patched
`lib/`, `build-obj -target wasm64-emscripten -mcpu=generic+atomics`, one core) takes 44.3 s in
ReleaseSafe and 14.4 s in Debug.

The demo test's own commands (`demos/zig/test/zig-llvm-browser.mjs`, the new check included) in one
session after `amy install zig-llvm`, on the round's package, without and with the setup done by
hand first (`steps-demo-*.json`), in seconds:

| | first `zig build-exe` | two more | `zig translate-c -lc` | `zig build` | in all |
| --- | --- | --- | --- | --- | --- |
| Chromium, without | 10.2 | 7.4 | 53.0 | 97.9 | 169 |
| Chromium, with | 9.8 | 7.5 | 0.6 | 11.8 | 30 |
| Firefox, without | 12.8 | 9.9 | 69.5 | 114.7 | 208 |
| Firefox, with | 11.4 | 11.0 | 1.4 | 16.7 | 41 |

With the setup the new check passed in both: after those commands the cache holds one maker and
one translator, so `-lc` does not change the translator's key.

The machine is shared with the night round (three image builds), so a run varies by several
seconds; the 13.5 s of the upgrade's report was not reproduced for 0.16. Firefox's second or third
`zig build` in one v0.1.4 session ended the run both times: the 6 GB browser slot's OOM killer
(journal, 22:21), so Firefox runs measure one or two builds.

Where the first `zig build` goes (Chromium traces):
- 0.16 (33.5 s): the zig process compiles the build runner with `build.zig`, and compiler_rt,
  until 28.0 s (LLVM's codegen 14.1 s, the object writer's kernel calls 8.1 s, Sema 2.2 s,
  AstGen 1.5 s, malloc 1.1 s); `cc` and `wasm-ld` link the runner in 0.4 s; the runner starts
  `zig build-exe hello.zig` 0.6 s later, which compiles it in 4.5 s and links it in 0.4 s.
- 0.17 (95.6 s): the zig process compiles the maker and compiler_rt until 79.6 s (LLVM's codegen
  and optimization 65.2 s, malloc 6.6 s, Sema 3.5 s, the object writer's calls 1.8 s); the link
  takes 0.3 s; the maker compiles the configurer (`build.zig` with `configurer.zig`, Debug) from
  80.0 to 91.9 s (codegen 6.5 s, the writer's calls 2.9 s, Sema 0.9 s), links and runs it, then
  compiles `hello.zig` from 92.4 to 95.6 s.
- 0.17 with the setup done (17.0 s): the zig process finds the maker in 0.5 s (its cache hit,
  rehashing the inputs whose stat changed); the configurer compiles from 0.5 to 13.2 s, hello
  from 13.8 to 17.0 s.

### Cause: Zig 0.17 compiles its tools on first use, by design

- 0.16's `zig build` (`cmdBuild`) compiles `lib/compiler/build_runner.zig` with the project's
  `build.zig` in Debug, per project, and translate-c was in the compiler (Aro linked in). 0.17's
  `zig build`, `zig init`, `zig fetch` and `zig libc` are a `jitCmd` of `lib/compiler/Maker.zig`
  with `.release_mode = .safe`, and `zig translate-c` (and `@cImport`) one of
  `lib/compiler/translate-c/main.zig` with Aro, `.release_mode = .fast` (`src/main.zig`), each
  compiled for the native target into the global cache the first time ("Compiling maker (first
  time setup)"); the maker then compiles the project's configurer in Debug. `ZIG_DEBUG_CMD`
  makes the tools Debug. Upstream pays this once a machine; a Dolly session starts from the
  package, so every session paid it: the whole 7.6-fold regression. Per project, 0.17 is faster
  than 0.16 (10.3 s against 19-24 s in Chromium, and natively 1.7 s against 2.2 s), so neither
  LLVM 22, the CPU features nor Dolly's patch costs anything measurable.
- The cache entry survives an install: a copy of the zig installation with new inodes and
  modification times, and a cache of only `h/`, `b/` and `o/` without the `_zcu.o` objects,
  hits in 15 ms natively (Zig rehashes the inputs whose stat changed; without `b/` it misses;
  `ZIG_LIB_DIR` does not change the key). In sessions the maker's and translator's digests are
  the same each time (`6b48a6ea…`, `4e7afa28…`). Zig accepts a cached source (`z/`) only for a
  file of the same size, modification time and inode (`loadZirZoirCache`), so those are rebuilt
  after an install anyway (60 MB, as the session's `du` showed).
- In a session the setup writes 95 MB: `z/` 75 MB, the two tools' objects 11 MB, `maker.wasm`
  4.8 MB, `translate-c.wasm` 3.7 MB, compiler_rt 0.5 MB, manifests and builtin modules 0.15 MB.

### Fix: the package does the first-time setup

`demos/zig/Dollyfile-zig-llvm` runs `zig init --help` and `zig translate-c` of an empty header
(the translation in a cache of its own) when it is built, removes `z/`, `tmp/` and the `_zcu.o`
objects, and retains `/home/dolly/.cache/zig` (9 MB): HOME is `/home/dolly` for every process
(`src/dolly.c`), so this is the cache Zig opens in a session and in a recipe, with no variable to
set (`git` keeps `~/.gitconfig` the same way). The demo test checks that, after `zig build-exe`,
`zig translate-c` and `zig build`, the cache still holds one maker and one translator.
`ghostty-gtk` and `ghostty-x11` are repinned; `ghostty-gtk` runs `zig build` in its recipe, which
no longer compiles the maker there.

The package does not build in a 6 GB `build` slot: Chrome was killed by the slot's OOM killer
while the builder restored `zig-llvm-build`, `llvm22` and `cc` (2026-11-04 23:56, before any of
the new steps ran), as for the upgrade, which built it in a 9 GB slot.

### Kernel calls (both versions, not the regression)

- LLVM's wasm object writer patches each relocation with `raw_fd_ostream::pwrite_impl`, which is
  `lseek`, `write`, `lseek` (`WasmObjectWriter::applyRelocations`): in 0.16's first `zig build`
  8.1 s of the 28 s compile, in 0.17's configurer 2.9 s of 11.9 s. Natively `zig build-obj
  hello.zig -target wasm64-emscripten` makes 63,294 `lseek` and 31,970 `write` calls.
- A C program timing 100,000 calls in a `default` session (`bench.c`): `lseek` 10.7 µs,
  `pwrite` 10.7 µs, the writer's three calls 34 µs in Chromium; 21 µs, 22 µs and 63 µs in
  Firefox (native: 0.06 µs, 0.47 µs, 0.6 µs). Each call is a `postMessage` to the supervisor
  and an `Atomics.wait` (`src/process-worker.mjs`). Filed as
  `tasks/20261104-131850-llvm-relocation-calls`.
- `amy install zig-llvm` installs 19,660 files, 446,356,421 bytes, after `cc`'s 134,168,966:
  580 MB, more than the 512 MiB a session save holds (`docs/sessions.md`), so such a session
  cannot be saved, with or without the 9 MB of the setup.

## Findings (2026-11-03, with evidence)

Evidence under `build/zig017-evidence/` of `work/sdl2` (downloads in `dl/`, Ghostty's history in
a blobless clone `ghostty-git/`).

### Zig 0.17.0

- Source `https://ziglang.org/download/0.17.0/zig-0.17.0.tar.xz`, sha256 `b6c7f172…8abd`; the
  host build `zig-x86_64-linux-0.17.0.tar.xz` `1cbe9df9…2026` (download index, 2026-11-03).
- **LLVM 22**: `CMakeLists.txt` `find_package(llvm 22)`, `README.md` "LLVM, Clang, LLD development
  libraries, version 22.x", `cmake/Findllvm.cmake` refuses anything but 22.x. The newest 22
  release is 22.1.8 (2026-06-16; `llvm-project-22.1.8.src.tar.xz` sha256 `922f1817…5888`, GitHub
  release digest). LLVM 23.1.4 is newer but Zig 0.17 does not take it. So `llvm21` becomes
  `llvm22` (a new long build), and `llvm21-std-specializations.patch` (upstream's a558d656, "from
  LLVM 22") goes away. Zig's required target list is unchanged; its Clang library list gains
  `clangOptions`, `clangAnalysisLifetimeSafety`, `clangFormat` and `clangToolingInclusions` and is
  reordered (`cmake/Findclang.cmake`).
- `bootstrap.c` and CMake's zig2 step no longer pass `--dep aro -Maro=lib/compiler/aro/aro.zig`:
  the compiler (`src/`) no longer imports Aro; `zig cc`, translate-c and resinator run Aro from
  `lib/compiler/` as separate programs. `Dollyfile-zig-build` drops the two arguments.
- `stage1/config.zig.in` drops `skip_non_native` (nothing in `src/` reads it); `src/zig/config.zig`
  drops it too. `dev = .cbe` still means the C backend and C linker only (`src/dev.zig` unchanged
  there). `stage1/wasi.c` (zig1's imports, which `src/zig/zig1.c` provides) is byte-identical.
- `zig build` is rebuilt: a `configurer` and a `Maker` (`lib/compiler/Maker*`) replace
  `build_runner.zig`; `--global-cache-dir` is gone from `zig build` (use `ZIG_GLOBAL_CACHE_DIR`),
  and the configuration is cached (`--cache-poison`). Only `zig-llvm` has `zig build`, so this
  touches `demos/zig`'s patch (its `ZIG_LIBC` hunk was in the old runner) and the host Zig that
  `demos/ghostty-gtk/prepare-ghostty.sh` runs, not the core.
- The core patch (`config/zig-0.16.0-dolly-native.patch`, 17 hunks) becomes
  `config/zig-0.17.0-dolly-native.patch`, 13 hunks. Upstream fixed four: the futex timeout cast
  (`std.math.cast … orelse maxInt`), `W.STOPSIG`'s return type and `Sigaction`'s handler types in
  `os/emscripten.zig`, and the CPU count: 0.17 has an `.emscripten` case calling
  `emscripten_num_logical_cores`, which Dolly's process library defines (`src/process/threads.c`,
  weak in `pthread-stubs.c`), so the patch's sysconf branch and its `_SC.NPROCESSORS_ONLN` are
  dropped (zig1 refused the old hunk: "duplicate switch value '.emscripten'"). Still needed:
  directory listing through musl's `getdents`, `O_PATH` off, `sigset_t`, `nlink_t`, `nfds_t`,
  `HOST_NAME_MAX`, `_SC.PAGESIZE`, `T` ioctls, the thread guard and signal stack, the libc page
  allocator for threaded programs, and zig's own path.
- **Zig 0.17 links libc for every Emscripten program** (`Target.requiresLibC` now lists
  `.emscripten`; 0.16 linked it only with `-lc`, and `demos/zig`'s patch made it the default for
  `zig-llvm`). So the `zig` package's `zig build-obj -ofmt=c answer.zig`, with the native target,
  looked for the native libc and failed (Chromium, 2026-11-03): first "UnableToSpawnCCompiler",
  since the core Zig's std had no process spawning on Emscripten (only `demos/zig`'s patch had
  it); with the four `posix_spawn` hunks moved into the core patch (now 19 hunks; the demo's goes
  from 16 to 10), "CCompilerCannotFindHeaders": Zig asks `cc -E -Wp,-v -xc /dev/null`, and Dolly's
  driver (`src/compiler.cpp`) takes `-Wp,-v` for an unknown warning option and prints no search
  list, while `cc -E -v` prints it. The `zig` package now ships `/usr/lib/zig/libc.txt` (0.17's
  fields: `gcc_dir` became `cc_dir`, `darwin_sdk_dir` is new; `zig-llvm`'s file too) and exports
  `ZIG_LIBC`; amy applies a package's environment from the next session load, so the amy test's
  zig row names it, as `zig-llvm-browser.mjs` already did. With it, `zig build-exe` of a std
  program also works without `-target`. The spawn hunks stay in the core: programs built with the
  `zig` package now start processes (a `std.process.spawn` of `echo` printed `hello child`).
  Proposal (a seed change, the compiler's driver): `-Wp,ARG` passes ARG to the preprocessor as in
  GCC and Clang; then Zig finds the libc by itself and the file goes. The smallest diff, in
  `src/compiler.cpp`'s option loop: exclude `-Wp,` from the `-W` branch beside `-Wl,`, and add
  `else if (starts_with(argument, "-Wp,"))` pushing each comma-separated part onto
  `options.frontend_options` (cc1 takes `-v` there, as `cc -E -v` shows). It needs a new seed
  compiler (`llvm-cc`), so it waits for the owner and a seed round.
- **Zig 0.17's maker (`zig build`) does not compile for Dolly.** `zig build` is now a `jitCmd` of
  `lib/compiler/Maker.zig`, built for the native target, and WebAssembly defaults to
  single-threaded (`src/target.zig` `defaultSingleThreaded`). Single-threaded, its protocol and web
  servers are `void` but it calls them (`Maker.zig:2476` `ws.startBuild()`, and ten more, and
  `Step.zig:287`); multi-threaded, it ends a file watcher Emscripten has none of
  (`Watch.zig:1025` `Os.deinit`, `Os` being `void`). Master has the same lines (2026-11-03). The
  demo's patch types the servers `noreturn` on a single-threaded host (the uses compile away, as a
  `?noreturn` capture is never analyzed), unwraps the time report by `if`, and guards `deinit` as
  the maker's own code does (`if (!have_impl) unreachable`). A host Zig compiles the maker both
  ways for wasm64-emscripten with them; applied in a session by `sed`, `zig build` of the test's
  project built and ran `hello child` in Chromium (102.5 s, the maker compiled in the session).
- A host Zig 0.17 compiles the patched compiler to C (`zig build-exe … -ofmt=c` of
  `src/main.zig` with `src/zig/config.zig`) in 2.3 s on this machine, so a source error shows in
  seconds instead of after a 5-minute image build.

### Ghostty

- Dolly's pin `4540d499` (2026-08-28, `1.3.2-dev`) has `minimum_zig_version = "0.16.0"`.
  Ghostty moved to 0.17 in "Update to Zig 0.17 (#14519)", merged as `3d07ef9e` on 2026-10-20
  (`160093da` in it sets `minimum_zig_version = "0.17.0"`). **v1.4.0** (tag of 2026-10-27,
  commit `83fb9562`) is the first release that requires 0.17.0; v1.3.1 requires 0.15.2. Dolly
  now pins v1.4.0.
- Its packages: translate-c is now a local package (`pkg/translate-c`) over
  `translate_c-02ff0c52…` (sha256 `e344433b…0591`); uucode moves to `ea621497…` (sha256
  `f37c4071…eacbf`); Wuffs is unchanged. uucode's generator now reads `ucd/.gitignore` to check
  which UCD files it may read; the staged `ucd/` keeps it.
- The C API `src/ghostty/display.c` uses is source-compatible: it compiles against v1.4.0's
  headers with the same diagnostics as against `4540d499` (host `gcc -fsyntax-only`). The header
  diff (16 files, +3834 −296) adds render-state, search, snapshot and OSC APIs; what it removes
  (`ghostty_terminal_vt_write_until_ground`, `GHOSTTY_OSC_COMMAND_CONTEXT_SIGNAL`) display.c does
  not use, and the rest of the removals are comment rewording.
- What else changes in the terminal: 887 commits from `4540d499` to v1.4.0, 231 of them in the
  terminal library (`src/terminal`, `lib_vt.zig`, `include/ghostty`; +30281 −3626 lines in
  `src/terminal`), and uucode's UCD moves from Unicode 17.0 to 18.0. The display grows from
  13.99 MB to 14.37 MB. The terminal's own tests (kitty graphics, keys, selection, scrollback)
  pass unchanged.
- `config/ghostty-dolly.patch`: the same seven hunks, two of them rebased (the page memsets and
  kitty graphics' shared-memory refusal, which v1.4.0 moved; it now also refuses without libc,
  which does not cover Dolly).
- `src/ghostty/generated/` regenerated by Ghostty's own build with the host Zig 0.17, now for
  `-Dtarget=wasm64-emscripten` instead of `wasm64-freestanding`: v1.4.0 forces kitty graphics off
  on freestanding targets (`src/terminal/build_options.zig` `kittyGraphics`), so the freestanding
  options would have dropped Dolly's kitty graphics. The build writes the options and Wuffs'
  bindings, then fails as expected ("unable to provide libc for target wasm64-emscripten-musl").
  It must run in a Git checkout of the tag with `--cache-poison=poisoned`: run elsewhere, its
  version came from Dolly's own Git (`1.4.0-zig-0-17+d1535fbcd`) and a cached configuration kept
  it. New option: `search`.
- `config/ghostty-source-manifest.txt` (no generator before) is the set of Ghostty files Zig opens
  compiling `lib_vt.zig` with the recipe's module graph: `strace -f -e trace=openat` of that host
  `zig build-obj` reproduces the old list for the old commit's layout, and gives 568 files for
  v1.4.0 (25 new, 3 gone).
- The module graph in `Dollyfile-ghostty-build`'s Makefile is unchanged in v1.4.0 (compared with
  the commands `zig build --verbose` prints). Its Wuffs module now also takes eight test images
  (`pixels`), but only its unit tests import them.
- **A wasm64 ABI bug in Zig 0.17's compiler_rt** (still on master, 2026-11-03): its float
  comparisons (`__lttf2`, `__gttf2`, …; `lib/compiler_rt/comparef.zig`) and zig.h's
  `zig_FloatCompareResult` return a C `long` wherever `long` is pointer-sized, so i64 on wasm64.
  LLVM's WebAssembly libcalls, LLVM's compiler-rt ("Both wasm32 and wasm64 use i32",
  `fp_compare_impl.inc`) and Zig's own LLVM backend (`buildFloatCmp`, `.return_type = .i32_type`)
  use i32. zig-build's link said so: `wasm-ld: function signature mismatch: __gttf2 … (i64, i64,
  i64, i64) -> i32 in zig2.o … -> i64 in compiler_rt.o` for seven functions, and wasm-ld turns
  such a call into a trap. Zig 0.16 used i32 throughout. The core patch makes WebAssembly i32 in
  both places, as AArch64 already is.

### Ghostty's GTK application (`demos/ghostty-gtk`)

- Every Ghostty that builds with Zig 0.17 renders GTK's OpenGL through EGL: its
  `src/renderer/opengl/Device.zig` (since ed350cbb, 2026-09-29, before the Zig 0.17 merge of
  2026-10-20) opens `EGL_PLATFORM_SURFACELESS_MESA` or GTK's EGL display and makes a context per
  surface. Dolly's `mesa-build` is GLX over Xlib with softpipe, and the demo's patch loads GTK's
  GLX context (`glXGetProcAddressARB`). So the demo cannot move with the terminal by a rebase: it
  needs Mesa's EGL (surfaceless platform, softpipe) first. Its patch also no longer applies (7 of
  22 files rejected even with fuzz: `build.zig`'s libghostty-vt install, dcimgui, SharedDeps'
  pty library, homedir, open, the wasm target, OpenGL's context).
- Its staging (`prepare-ghostty.sh`) would have failed every full image build at source
  preparation, since its patches apply with `--fuzz=0`. So the patch is rebased onto v1.4.0 (21
  files: the six rejected ones by hand, the GLX context hunks dropped, as EGL replaces them),
  `zig-packages.txt` maps each package it kept to v1.4.0's (by dependency name and owner in the
  `build.zig.zon` files of both trees; 22 become 21, the two vaxis collapse into one), libxev's
  and translate-c's patches apply unchanged, the recipe says 1.4.0, and the staging runs (100 s).
  The build in Dolly is not verified: it needs `zig-llvm` (LLVM 22) and Mesa's EGL, so it is
  expected to fail at Ghostty's renderer; `tasks/20261103-110119-ghostty-egl` has it.

## Measurements (2026-11-03, `work/sdl2`, build slot of 6 GB, `DOLLY_IMAGE_JOBS=1`, Chrome)

| Image | Zig 0.17, Ghostty 1.4.0 | Before (tasks of October, Zig 0.16) |
| --- | --- | --- |
| `zig-build` | 502–662 s, 198.4 MB | 397–598 s |
| `ghostty-build` | 91–111 s, 215.9 MB | 78–96 s, 212.0 MB |
| `display` | 7 s, 14.37 MB | 13.99 MB |
| `zig` (package) | 7 s, 62.8 MB | |
| the chain from `zig-build` to `default` and `system` | 865 s | |

`zig-llvm-build` in a 6 GB `build` slot: zig1 made the LLVM-enabled compiler's C in 21 min
(21:02 to 21:23; 229 MB of C, as a host Zig 0.17 writes it, against the core's 65 MB), then `cc -c`
of it was killed by the slot's OOM killer after 7 min ("Target crashed"). It needs the 9 GB slot,
as `llvm21`'s chain had (`tasks/20261014-234000-zig-llvm`).

LLVM 22 in a 9 GB `bigbuild` slot (Chrome, 2026-11-03 22:15 to 23:34): `llvm22-tablegen` 218 s
(255.8 MB); `llvm22` 4500 s, its `make -k -j4` 4450 s, 448.0 MB, `llvm-config` 22.1.8 with Zig's
20 targets, no failed unit. (`llvm21`'s make took 3797 s in the round of 3 November; its image
was 426.6 MB.) Then in the same slot `zig-llvm-build` 1715 s (zig1 19 min, `cc` of the compiler's C
8 min at 5.7 GB of the renderer; 372.1 MB) and `zig-llvm` (zigcpp against LLVM 22's headers and
the link; 449.2 MB; `zig version` 0.17.0). The chain from `llvm22-tablegen` to `zig-llvm`: 109 min.

Staging the whole `ghostty-x11` closure (`prepare-image-sources.sh`, every `has_image` of
`ghostty-gtk`, `mesa-build`, `llvm22`, `zig-llvm-build`) runs, 22 s with the trees prepared.

In a `default` session (Chromium): `amy install zig` 3.4–4.6 s; `zig build-exe hello.zig` of
the man page's program, its `cc` and its run 4.7 s.

## Tests (2026-11-03, `work/sdl2`, on the images above)

- Chromium and Firefox: `test/terminal-browser.mjs` (kitty graphics among its checks),
  `touch-browser.mjs`, `core-browser.mjs`, `default-browser.mjs` (its composed `core display zig`
  image included), `display-browser.mjs`, `display-cursor-browser.mjs`, `shell-browser.mjs`,
  `pager-browser.mjs`, `pty-browser.mjs`, `image-browser.mjs`, `indicators-browser.mjs`,
  `embedding-browser.mjs`, `slop-browser.mjs`, `man-browser.mjs`, `custom-session-browser.mjs` and
  `process-browser.mjs` passed. `test/zig-sdk.artifacts.mjs` passed (3/3).
- The amy test's zig row and more, run as a script of their own in `default` (amy-browser.mjs
  needs every package of the catalog): `amy install zig`; `answer.zig` as C for a C program;
  `hello.zig` with the standard library, with and without `-target`; a program that spawns
  `echo`; and a program comparing two `f128`, linked with Zig's own compiler_rt, whose link printed
  no signature mismatch and which printed `truefalse`. Passed in Chromium and Firefox.
- Source suite: 470 passed.
- `npm run test:demos -- zig` (zig-llvm in `default`: `zig build-exe` of a program that spawns
  a child, a threaded one, one listing a directory, `zig translate-c -lc`, and `zig build` of a
  project): passed in Chromium (202.7 s) and Firefox (234.0 s), 2026-11-04 01:08, with the maker
  fixes; without them `zig build` failed at `Maker.zig:2476`. (Zig 0.16's run took 34.6 s and
  45.8 s: 0.17's `zig build` compiles a larger maker in the session.)
- Not run: the ghostty-gtk demo tests (need Mesa's EGL), the artifact tests and
  `amy-browser.mjs` (both need the whole catalog).

## Lessons

- A host Zig of the pinned version is the fast loop for a Zig upgrade: it compiles the patched
  compiler to C in 2.3 s and Ghostty's VT library in 8.5 s, with the recipe's module graph, and
  shows every source error at once; the image build shows one per 5 to 10 minutes.
- A green image build is not a working one: the wasm64 float-comparison mismatch appeared only as
  seven wasm-ld warnings in a build that succeeded, and wasm-ld makes such calls traps. Read the
  link lines of every rebuilt compiler.
- Generated inputs take their context from where the generator runs: Ghostty's build took its
  version from Dolly's Git and kept it in Zig 0.17's cached configuration, and the documented
  `wasm64-freestanding` target would have dropped kitty graphics silently. Run upstream's build in
  its own checkout, uncached, for the target Dolly builds.
- A pin that several demos stage breaks the whole catalog's source preparation if one of them
  patches with `--fuzz=0` (ghostty-gtk did): run every `has_image` staging that reads the pin,
  not only the images being built.
- WebAssembly's defaults put Dolly on upstream code paths nobody runs: Zig compiles its own tools
  single-threaded for wasm, and 0.17's maker had never compiled single-threaded or without a file
  watcher. A host Zig compile of the tool for `wasm64-emscripten` in both modes found all of it
  in seconds; trying the fix with `sed` in a session before the 28-minute rebuild proved it.
- amy applies a package's environment from the next session load, so a package whose tool needs
  a variable right after `amy install` (ZIG_LIBC) fails the install-then-use check; the root cause
  here was Dolly's cc ignoring `-Wp,-v`.
- A fresh session is a fresh machine: whatever upstream does once a machine (Zig 0.17's
  "first time setup" of its maker and translator) a Dolly session repeats, and an image build is
  the place to do it once. When a tool is upgraded, read its first-run paths (`jitCmd` here), not
  only its per-build ones: per project 0.17 was faster than 0.16; only the first run regressed.
- The old version's published bytes are a free baseline: `work/locks/published/v0.1.4` served
  read-only gave Zig 0.16 on its own runtime and images in minutes, with no build.
- Playwright's `startTracing(page, { categories })` still records Chrome's default categories
  unless the list starts with `-*`: 787 MB in 22 s and a truncated trace without it, 62 MB for
  the whole build with it. A trace's `call` frames are the kernel round trips; grouping their
  callers found LLVM's per-relocation `lseek`/`write`/`lseek` (a quarter of a Debug compile).
- A tool's cache can ship in a package when its key does not hold paths or inodes: test the
  relocation natively first (a copy with new inodes and mtimes, then time the hit), and see which
  parts are keyed by inode (Zig's `z/`) and drop them.
- Count what a 6 GB `build` slot can restore: `zig-llvm`'s builder (zig-llvm-build, llvm22, cc)
  is killed before its first step, so a one-line recipe change waits for a 9 GB slot. Measure the
  change by hand in a session first; that gave the numbers hours before the slot.
