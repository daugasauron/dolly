# Zig 0.17 across the board: zig, its LLVM, Ghostty's build and every image built with them

- STATUS: OPEN
- PRIORITY: 220
- TAGS: zig,toolchain,display

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

## State (2026-11-03 22:20 JST)

Branch `zig/0.17` in `work/sdl2`. Pins, patches, recipes and docs name Zig 0.17.0, Ghostty
v1.4.0 and LLVM 22.1.8; nothing pins 0.16 or LLVM 21. Built and tested in this tree: the core
chain (Measurements, Tests). Building since 22:15 in a 9 GB `bigbuild` slot (unit
`dolly-zig017-llvm22b`, `build/zig017-evidence/image-llvm22.log`): `llvm22-tablegen`, `llvm22`,
`zig-llvm-build`, `zig-llvm`; then `npm run test:demos -- zig`. `demos/ghostty-gtk` is staged for
v1.4.0 but needs Mesa's EGL (`tasks/20261103-110119-ghostty-egl`). Left: those, then the round.

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
- Not run: `npm run test:demos -- zig` (needs `zig-llvm`, so LLVM 22), the ghostty-gtk demo
  tests, the artifact tests and `amy-browser.mjs` (both need the whole catalog).

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
- amy applies a package's environment from the next session load, so a package whose tool needs
  a variable right after `amy install` (ZIG_LIBC) fails the install-then-use check; the root cause
  here was Dolly's cc ignoring `-Wp,-v`.
