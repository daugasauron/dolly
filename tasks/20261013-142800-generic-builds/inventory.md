# Inventory: what the build images compile, and the packages they should install

Read: all 133 recipes on `main` (20 `APPLICATION`, 34 `TOOLCHAIN`, 79 `PACKAGE`), `docs/dollyfile.md`, `config/source-pins.sh`, the demos' `prepare-sources.sh`, `demos/zero-ad/build-sources.tsv`, the patches, `src/dollyfile.c`. Nothing was built or changed.

## Three facts the plan rests on

1. **31 of the 79 packages hold no build**: 22 are `FROM` a build image and compile nothing, 9 are `COPY` rows. 39 hold their build, 9 are data.
2. **A build-only tool cannot be an `INSTALL` row of a package.** A package has one `FROM`; its `INSTALL` rows are recorded and installed first by whoever installs it, host modules included. `tools-build` exists for that reason (its comment: nothing should install mandoc because a page was formatted). So Python, Rust, CMake or mandoc must be in the base.
3. **By reference holds for package recipes only.** `load_artifact` has `keep = !(package_recipe && mode != IMPORT_COPY)`: a package's build keeps none of what it installs, but a build image such as `zero-ad-engine` keeps the files of every package it installs.

## 1 and 2. What is built where, and what is built twice

| Thing, pin | Built in; how | Users today | Twice? | Proposal |
| --- | --- | --- | --- | --- |
| Slop and 19 commands, `dollyfile`, libc++ (Emscripten 6.0.8's), Make 4.4.1 | `system-build`; `cc` rows, a Makefile in the recipe | all; views `core`, `cc`, `make` | libc++ again in `llvm-runtimes`, deliberately | stays: the bootstrap root, which needs Make before a package can exist |
| sbase c546c3a5, Samurai 1.3, Git 2.55.0, awk, 16 Dolly commands, `download`/`upload` | `system-tools`; patches of 249 and 293 lines, Makefiles in the recipe | views `posix`, `ninja`, `git`, `amy`, `transfer` | sbase 3× (`sbase`, `tar`): one archive, three tool lists | each package holds its build, `FROM system-build` |
| Zig 0.16.0 (WAMR runs its seed); libghostty-vt, `libdisplay.so` | `zig-build`, `ghostty-build` | `zig` view; `display` (4 `COPY`) | no | `zig` and `display` hold them; WAMR and the vt library stay inside |
| libuv 1.52.1; CMake 4.4.3 | `cmake-build`; libuv is a port (151-line patch, 3 files, 27-line Makefile), CMake upstream's bootstrap | 11 recipes are `FROM` it; views `libuv`, `cmake` | no | two packages; `cmake-build` composes |
| QuickJS-ng 0.15.0 with Dolly's runner, Janis, TypeScript 5.9.3 | `typescript-build` | `javascript` view, `pi-build`, three game agents | no | `quickjs`, `janis`, `typescript` (task `javascript-split`) |
| Lua 5.1.5, LPeg 1.1.0, luv 1.52.1-0, utf8proc 2.11.3, tree-sitter 0.26.13; Neovim 0.12.5 | `neovim-build`; upstream Makefiles and CMake, 66-line patch | Neovim; `lua` (11 `COPY`), `nvim` (12) | Lua 3×: 5.5.1 in `slopyard`, premake's bundled one; utf8proc also NetSurf's copy. Different versions: real | `lua`, `lpeg`, `luv`, `utf8proc`, `tree-sitter`, `lua5.5`; `nvim` holds Neovim |
| raylib 6.0 with Dolly's adapter, Box3D 0.1.0 | `gamedev-sdk`; `sdk.mk` and C in the recipe | bhop, slopyard; two views | Box3D 2×: `slopyard`'s has `-pthread` and SIMD, real | two packages; slopyard's variant stays |
| OpenAL Soft 1.24.3 | `openal-build`; upstream CMake, 123-line patch | 0 A.D.; `openal` view | no | package |
| pkgconf 2.5.1 | `zero-ad-deps`; one `cc` row, `config.h` in the recipe | 0 A.D.'s builds; view | no | package |
| libpng 1.6.58, FreeType 2.14.3 | `zero-ad-deps`; upstream CMake | 0 A.D., Xonotic, Wine; views nobody installs | no | packages |
| Ogg 1.3.5, Vorbis 1.3.7, libxml2 2.13.5 | same | 0 A.D. | no | packages |
| ICU 68.2, libsodium 1.0.20, Boost headers 1.83.0 | `zero-ad-deps`; `objects.mk` and flags in the recipe | 0 A.D. | no | packages; ICU must bring the data file 0 A.D.'s content supplies today |
| fmt 7.1.3 | `zero-ad-deps` | 0 A.D. | 3 versions: 11.2.0 (one file) in `mojo-build`, 11.1.1 inside OpenAL | package if one version serves both, not determined |
| ENet 1.3.18 | `zero-ad-deps`; its sockets replaced by `enet-dolly.c` (153 lines) | 0 A.D. | no | stays: the transport is 0 A.D.'s relay |
| SpiderMonkey 128.13.0 | `zero-ad-spidermonkey`; mozbuild | `zero-ad-engine` (2 `COPY`) | no | package, below |
| premake 5.0.0-beta7 | `zero-ad-engine`; two `cc` stages, 41-line patch | 0 A.D. | no | package |
| LLVM 24 @4bfd08c2 with Clang and LLD | `llvm-tablegen`, `llvm-build`, `llvm-cc` | `llvm` (1 `COPY`) | 3×: `rust-llvm` 22.1.8, PIC; `mojo-llvm` @4154b56c with MLIR and Mojo's patch. Three compilers' pins: real | stay build stages; share the `Dolly.cmake` each restates |
| Zstandard 1.5.7 | `mojo-llvm`, the library | Mojo | 2×, same pin as package `zstd` | `mojo-llvm` installs `zstd` |
| rustc 1.98.1, Cargo 0.99.0 | `rust-build`, from the seed in `rust-sdk` | `rust`, `cargo` (`COPY`); 5 recipes `FROM` it | no | `rust`, `cargo` hold the builds |
| Mojo 1.1.0 and its runtime | `mojo-build`, `mojo-runtime`; patches of 127, 1,873 and 1,258 lines | `mojo` (5 `COPY`) | no | `mojo` holds it |
| llama.cpp @093a2f86; transcribe.cpp @c63b18e2 | `llama-build` and `local-llm-build`; `speech-build` | views `llama`, `speech-to-text`, `voice`; `pi-local` (2 `COPY`) | ggml 2×, each engine's own copy: real | `llama`; `transcribe` and its two programs |
| IJG libjpeg 9f | `xonotic-build` and `wine-build`; unit lists in their Makefiles | Xonotic's client, NetSurf | 2×, same pin | package `libjpeg` |
| libffi 3.5.2 (inside `python`); GNU termcap 1.3.1 (inside `less`); gmqcc (`xonotic-build`) | port file; two objects; 14 units | CPython; less; Xonotic | termcap 3×: Emacs's own, `libterminfo` | `libffi`, `gmqcc` packages; measure `less` on `libterminfo` |
| Wine 4.0.4 with NetSurf 3.11 and its 10 libraries, GIMP 2.2.17 with GLib, ATK, Pango, GTK+, libart, fontconfig, expat | `wine-build`; patches of 1,536, 390 and 276 lines | `wine` (15 `COPY`) | no | stays: one executable, old series chosen for it |

**5. What else stays inside its build**: copies an upstream vendors and pins itself (jq's Oniguruma, pigz's Zopfli, sqlite's linenoise, Cargo's libgit2 1.9.4, Mojo's fmt file, xxHash and OpenTelemetry headers, the two ggml), and the demos' own programs (pyrogenesis, DarkPlaces, ClassiCube, Seven Kingdoms, Pi, Codex). The table of 2026-10-12 lacks libjpeg, premake, `mojo-llvm`'s zstd, libffi and slopyard's second Box3D; four of its names have changed (`transcribe`, `mojo-compiler`, `pi-coding-agent`, `codex-cli`).

## 3. The 31 views, and what a build of their own takes

- `cc`, `core`, `make` (`system-build`): stay views of the root.
- `posix`, `git`, `ninja`, `transfer`, `amy` (`system-tools`), `session-recover` (`system`): the step blocks move; sources are plain tars. `git` gains `INSTALL zlib` and `curl`. Entangled: one Makefile builds 16 commands for three packages.
- `zig` (`zig-build`), `display` (`COPY` from `ghostty-build`): `display` needs zig in its base.
- `cmake`, `libuv` (`cmake-build`): `FROM system-tools`; `cmake` installs `libuv` and `cc`.
- `javascript` (`typescript-build`): one archive holds engine and runner; split.
- `lua`, `nvim` (`COPY` from `neovim-build`): `lua` already fetches Lua's archive for its manual page; `nvim` needs five static libraries in its base.
- `raylib`, `box3d` (`gamedev-sdk`): one `sdk.mk`, and a `libm.a` the package already leaves out.
- `freetype`, `libpng`, `pkgconf` (`zero-ad-deps`), `openal` (`openal-build`): nothing entangled.
- `rust`, `cargo` (`COPY` from `rust-build`): entangled; one recipe replaces the seed compiler in place twice, then builds Cargo, and `rust-llvm` must be in the base.
- `codex`, `pi` (`COPY` from `codex-build`, `pi-build`): protox and `tsc` go into the base.
- `llvm` (`COPY` from `llvm-cc`), `mojo` (`COPY` from `mojo-build`, `mojo-runtime`): `FROM` their LLVM stage.
- `llama` (`local-llm-build`), `speech-to-text`, `voice` (`speech-build`).

## 4. `COPY` rows that are a package in disguise

- FreeType and libpng out of `zero-ad-deps`: `xonotic-build` (5 rows), `wine-build` (8), `xonotic` (2).
- SDL2 out of package `sdl2`: `zero-ad-deps` (3 rows) where six recipes install it.
- `neovim-build` into `lua` and `nvim`: five licence sets taken by both.
- `pi-local` copies `dolly-llama` and its licences (2 rows), which `llama` exports.
- Licences of statically linked libraries travel by `COPY`: 12 of `zero-ad`'s 13 rows, 9 of `nvim`'s 12, 7 of `wine`'s 15.
- The same `SOURCE` in several recipes: `stb_truetype.h` (4), `sbase.tar` (3), `llvm-project.tar.gz` (3), `llvm-host-triple.patch` (4).

## Bases and host modules

A package's build is `FROM system-build` when `system-tools` installs it, `system-tools` for C with a Makefile in the recipe, `cmake-build` for upstream CMake, `tools-build` when a manual page is formatted, `rust-build` for Rust. What is awkward: `cmake-build` and `system-tools` compile things themselves; no base holds pkg-config; `rust-build` never sees `system-tools`, so nothing holds Rust with Python and `patch`; and by fact 2 every new tool combination needs its own base. The plan keeps one shape: `X-build` is a base and `INSTALL` rows and compiles nothing, `X` is the package with the build.

Host modules a package needs to be useful: `sdl2`, `raylib` display and input; `llama` gpu; `transcribe` threads, its programs microphone and buttons; `lua`, `nvim`, `python` dso; `tmux` pty and sockets; a program playing through `openal` audio, which `default` does not declare. The rest need `runtime@0` alone.

## The package set and the order

The catalog gains `libogg`, `libvorbis`, `libxml2`, `libsodium`, `icu`, `boost-headers`, `libjpeg`, `utf8proc`, `tree-sitter`, `lpeg`, `luv`, `lua5.5`, `premake`, `spidermonkey`, `transcribe`, `libffi`, `gmqcc`, and `quickjs`, `janis`, `typescript` for `javascript`. Ten build images go (`openal-build`, `zero-ad-spidermonkey`, `llama-build`, `local-llm-build`, `speech-build`, `mojo-build`, `mojo-runtime`, `ghostty-build`, `typescript-build`, `llvm-cc`); one comes (`spidermonkey-build`).

1. **`.pc` files to their owners**: `zlib`, `curl`, `sdl2` ship the three files `zero-ad-deps` writes. 3 recipes edited; 122 images repin.
2. **Leaf libraries hold their builds; no consumer changes.** Rewrite 8 views (`pkgconf`, `libpng`, `freetype`, `openal`, `libuv`, `lua`, `raylib`, `box3d`), add 13 (the list above to `premake`). 21 images; no build image changes.
3. **Build images install them.** `zero-ad-deps` becomes `FROM cmake-build`, eleven `INSTALL` rows, and fmt and ENet built there; `xonotic-build`, `wine-build`, `xonotic`, `gamedev-sdk`, `slopyard`, `mojo-llvm` follow. 15 images rebuild, `openal-build` goes.
4. **`spidermonkey`**: 2 new, 1 removed, 2 rebuilt.
5. **Engines on composed bases**: `nvim` (4 images), `llama` (3), `transcribe` with `speech-to-text` and `voice` (5), `mojo` (2), `codex` (3), `llvm` (1).
6. **`quickjs`, `janis`, `typescript`**, and `pi` holding its build: 3 new, 12 rebuilt.
7. **`rust`, `cargo`**: 26 images.
8. **`cmake`**, with `cmake-build` composing `cmake` and `pkgconf`: 82 images on today's graph.
9. **The root round**: `posix`, `git`, `ninja`, `transfer`, `amy`, `session-recover`, `zig`, `display`; `system-tools`, `system` and `zig-build` compose; `libffi` leaves `python`. 123 images.

Steps 1 and 9 each repin nearly everything and can be one round; step 1 is first because SpiderMonkey's configure reads `zlib.pc`. `docs/dollyfile.md` ("Packages and amy") and the rule of 2026-10-12 ("cheapest shape first: a thin `PACKAGE`") still recommend views and change with step 2.

## SpiderMonkey in full

Today `zero-ad-spidermonkey` is `FROM zero-ad-deps` and installs `python`, `cargo` and `cbindgen`. Of `zero-ad-deps` it uses `pkg-config` and the `zlib.pc` written there (mozjs's `moz.configure` turns `--with-system-zlib` on for a standalone build), and `patch`, `sh` and `gzip` from `system-tools` beneath. None of 0 A.D.'s libraries.

`demos/spidermonkey/Dollyfile-spidermonkey-build`, a `TOOLCHAIN` that compiles nothing: `FROM system-tools`; `INSTALL python`, `cargo`, `cbindgen`, `pkgconf`; hosts runtime, dso, http, sockets, threads.

```text
DOLLY 7
PACKAGE spidermonkey
REQUIRES HOST runtime@0
FROM    .../demos/spidermonkey/Dollyfile-spidermonkey-build
INSTALL .../Dollyfile-zlib             # a program links -ljs_static -ljsrust -lz
SOURCE  .../dist/static/spidermonkey/mozjs.tar.gz /tmp/mozjs.tar.gz
SLOP    gzip -dc /tmp/mozjs.tar.gz | tar -xf - -C /
SLOP    patch ... upstream-fixes.patch       # three of 0 A.D.'s
SLOP    patch ... spidermonkey-dolly.patch   # today's 490 lines
FILE    /tmp/mozjs/build.slop                # today's body, into /usr
SLOP    slop -e /tmp/mozjs/build.slop
FILE    /usr/lib/pkgconfig/mozjs-128.pc      # today in zero-ad-engine
SLOP    c++ ... spidermonkey-check.cpp ... && run it
EXPORTS LIB    js_static /usr/lib/libjs_static.a
EXPORTS LIB    jsrust    /usr/lib/libjsrust.a
EXPORTS HEADER mozjs-128 /usr/include/mozjs-128
FOLDER  /usr/share/licenses/spidermonkey
```

- **Source.** The staged tree is `mozjs-128.13.0.tar.xz` taken out of 0 A.D.'s source release (`prepare-build-sources.sh`), without test262, non262, jit-test and web-platform. It has no pin in `source-pins.sh`; the package needs one. 0 A.D.'s `build.sh` names `releases.wildfiregames.com/libs/mozjs-128.13.0.tar.xz`, made from `firefox-128.13.0esr.source.tar.xz` by `make-source-package.py`.
- **Patches.** 0 A.D.'s `patch.sh` applies six unconditionally (two more are for i686 and macOS). Any Dolly build needs three: `FixExtraGCTracing` (Mozilla bug 1982134), `FixPython3_14` (Dolly's CPython is 3.14.7) and `FixRustLinkage` (links the Rust library when the shell is off). 0 A.D.'s own or inert here: `FixLibNames` (names a shared library Dolly does not build), `FixPkgConfigDebug`, `SuppressDanglingPointerWarning` (GCC). Dolly's `spidermonkey.patch` (490 lines, 18 files) is all the port's: wasm64 in configure, a `RUST_TARGET` override, `cargo-linker` without `exec`, missing binutils allowed, `getrandom`, `gc/Memory.cpp`, the jobserver crate. Nothing in it is 0 A.D.'s. The README's "no JIT, serial tasks" does not describe it: no JIT is a configure flag.
- **Flags.** `--disable-jit`, the wasi triple and `-D__wasi__` are the port's; `--without-intl-api`, `--disable-js-shell` and `--disable-jemalloc` are 0 A.D.'s mozconfig; `--disable-shared-js` is Dolly's. A general package could build the shell, so a session has `js`; not tried.
- **`zero-ad-engine` then** has `INSTALL spidermonkey` (and `premake`) in place of two `COPY` rows, the `mozjs-128.pc` body, `PKG_CONFIG_PATH=/tmp/pkgconfig` and the probe; `--with-system-mozjs` already asks pkg-config. `zero-ad` keeps its licence `COPY`. `0ad-spidermonkey-browser.mjs` and its fixture move with the package. No other recipe would install it today: every other JavaScript user links QuickJS.
- **In the way.** (1) Python and Rust: mozbuild is `configure.py`, Make, Cargo for `libjsrust.a`, and cbindgen. As `INSTALL` rows they would arrive with the library and put dso, http, sockets and threads on it and on `zero-ad-engine`; hence the toolchain. (2) `pkgconf` is a view of `zero-ad-deps` and `zlib.pc` lives there: steps 1 and 2 first. (3) The source and three patches come out of 0 A.D.'s archive. (4) The build names `/opt/rust-sdk/bin/dolly-rust-link` and the target `wasm64-emscripten-probe`, so the `rust` package's layout is its interface. (5) `/opt/mozjs` becomes `/usr`.
- **Host modules**: `runtime@0` alone. Inferred: `zero-ad-engine` retains a program linked with the library and declares neither threads nor dso.

## What I could not determine

- Sizes and times: nothing was built.
- Whether one fmt serves 0 A.D. (7.1.3) and Mojo (11.2.0), and whether a native `libjpeg.a` suits NetSurf inside Wine (it links native libpng and FreeType, so probably).
- Whether Wildfire's published mozjs tarball equals the one inside 0 A.D.'s release: not fetched.
- Whether Samurai, Git and awk build with `system-build`'s tools alone: their Makefiles in the recipe call only `cc`, `ar` and `mkdir`, and sbase is already `system-tools`' first step; not run.
- Whether a package keeps a `COPY` result its recipe later removes (`/opt/rust-llvm`).
- Whether `less` works on `libterminfo`, and whether the SpiderMonkey shell builds.
- Which bundled libraries CMake, CPython and Cargo compile (only libgit2 is visible in a recipe); the version of premake's Lua.

Paths: `/home/daug/dev/dolly/demos/zero-ad/Dollyfile-zero-ad-spidermonkey`, `/home/daug/dev/dolly/demos/zero-ad/Dollyfile-zero-ad-deps`, `/home/daug/dev/dolly/demos/zero-ad/toolchain/spidermonkey.patch`, `/home/daug/dev/dolly/demos/zero-ad/prepare-sources.sh`, `/home/daug/dev/dolly/demos/tools/Dollyfile-tools-build`, `/home/daug/dev/dolly/src/dollyfile.c` (line 1401), `/home/daug/dev/dolly/tasks/20261013-142800-generic-builds/TASK.md`.