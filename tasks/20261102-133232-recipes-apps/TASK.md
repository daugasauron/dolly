# Audit: every application and game Dollyfile

- STATUS: OPEN
- PRIORITY: 250
- TAGS: audit,dollyfile

The night of 2 to 3 November 2026, branch `audit/recipes-apps` from `integrate/2026-11-02`
(71d2603fc): every recipe of the application and game demos (bhop, classicube, cmake,
emacs, ffmpeg, fingers, ghostty-gtk, gpu-fluid, gtk, mojo, neovim, rts, sdl2, slopyard,
speech, tmux, wine, x11, xonotic, zero-ad, zsh; 80 recipes) read in full against
`work/RECIPE-AUDIT.md`. Evidence in `build/recipes-apps-evidence/` (not committed):
`snapshot-report.txt` (every image's size by directory, largest files, and the
`dolly.host` records of every retained executable, from `snapshot-report.mjs`) and
`host-declarations.txt` (declared `REQUIRES HOST` against those records).

## Method

- Declarations were measured, not read: a snapshot's retained Wasm executables were
  scanned for `dolly.host` records and compared with the recipe's `REQUIRES HOST`.
  `display@0` and `input@0` are needed by every image that is opened (the terminal),
  `snapshot@0` by one that saves sessions, `packages@0` where amy is installed; the rest
  of a declaration that nothing records is dead.
- Every patch, `sed`, flag and hand-written configuration was traced with `git log -S`
  to its first commit and its reason checked against today's core.

## One line per recipe

| Recipe | Verdict and findings |
| --- | --- |
| bhop | ok after fix 1: linked `-fno-builtin` against the libm shim; `rm -rf /tmp` moot |
| classicube-build | ok; final `rm -rf /tmp` moot |
| classicube | ok; `snapshot@0` is the session convention; `rm -rf /tmp` moot |
| cmake-build | ok (opened, so `display@0`/`input@0` are right) |
| cmake | CMake built at `-O0` since the 2026-09-07 checkpoint (`cmake.dm`), no reason recorded: proposal P1 |
| libuv | ok; `libuv-dolly.mk` also `-O0` (P1) |
| emacs | ok: `-O0` has a reason (conservative GC scans the stack, `prepare-emacs.sh`); the mtime helper works around the core tar not restoring times (shared finding S2) |
| gnu-emacs | ok |
| ffmpeg | ok: upstream's own configure runs under Slop (so configure scripts can); `time` is used but not required |
| fingers-build | ok; name is a toolchain's for a package (the app takes `fingers`) |
| fingers | ok, the leanest application (18 MiB): core, posix, display, fingers-build |
| mesa-build | `download@0`, `upload@0` declared, nothing records them (fix 2); Mesa's parsers made on the host while Dolly has `yacc` and `flex` packages: finding F3 |
| ghostty-gtk | ok; the 40-line `cc` wrapper is what Zig's link needs, explained |
| ghostty-x11 | ok; busy-wait for the server socket (3000 `test` spawns) shared with x11-desktop: F4 |
| gpu-fluid | ok: external `SOURCE` URLs are the documented exception (raw.githubusercontent.com) |
| pcre2 | ok |
| glib | `http@0`, `sockets@0` declared, no executable or program built with it records them (fix 2) |
| gtk-build | `download@0`, `upload@0` dead (fix 2) |
| mojo-llvm | ok (opened) |
| mojo | ok; 480 lines of C inline as `FILE` bodies where other demos stage a tar: F5 |
| mojo-gpu | ok |
| lua | all of Lua, LPeg and luv at `-O0` (P1) |
| nvim | utf8proc, tree-sitter, Neovim (`Debug -O0`) and the parsers at `-O0` (P1); welcome text says PTYs are unsupported while Dolly has `pty@0`: F6 |
| neovim | ok |
| rts-build | ok |
| rts-arena | ok; keeps 6.7 MiB of 7kaa source, which the agent reads |
| sdl2 | F7 fixed: Release (`-O3`) for an `-O1` of 4b4419628 with no reason (bdf48848a) |
| sdl2-image, sdl2-mixer, sdl2-ttf | ok |
| imgui | ok |
| imgui-x11 | ok; XFixes exclusion is a true trap reason; F7 fixed: its SDL2 at Release (fd60552c9) |
| raylib | fix 1: `rtext.c` compiled at `-O0` for a September compiler limit; `-fno-builtin` |
| box3d | fix 1: `-fno-builtin -U__SIZEOF_INT128__` for a September compiler limit |
| gamedev-sdk | fix 1: a `libm.a` of double-precision wrappers (`fabsf`, `sqrtf`, `abs`…) shadowing musl's; the toolchain resolves `-lm` itself (fingers proves it) |
| slopyard (generated) | fix 1: `-U__SIZEOF_INT128__` on Lua 5.5 and the game, which use no int128; `src/box3d.mk` the same; `ENTRY` script named `slopyard.slop` where others use `init.slop` (F8) |
| parakeet | ok, lean |
| speech-to-text, voice | ok; the same compile block twice (the four archive paths): F9 |
| speech-to-text-mic | ok |
| transcribe | ok (`threads@0` is the library convention) |
| pi-phone | ok (`audio@0` for what amy installs, as pi-agent) |
| libevent | ok; comment says `getrandom`'s header is missing: libc has `sys/random.h` now (F10) |
| libterminfo | ok: both `sed` fixes are real (tparm's int/long, tputs's cast), each guarded by a grep |
| tmux | ok |
| tmux-panes | ok, its extra modules explained |
| wine-build, wine | ok |
| x11-build | `download@0`, `upload@0` dead (fix 2) |
| pixman, xkeyboard-config, libxkbfile, xkbcomp | ok |
| xorg-server | ok (`audio@0` is SDL2's record) |
| xterm, twm, xclock, xeyes | ok; the ten-line licence `FOLDER` block repeated in five recipes, each a different set: not shared |
| x11-desktop | ok; F4 |
| gmqcc, libogg, libvorbis | ok |
| libjpeg | F7 fixed: `-O2` for Xonotic's `-O1` (b6c539c10) |
| xonotic-build, xonotic-shaders | ok |
| xonotic | ok; F8 (`xonotic.slop`); the two font-source `SOURCE`s exist for the pin alone, documented |
| boost-headers, fmt, freetype, icu, libpng, libsodium, libxml2, pkgconf, premake | ok |
| openal | F7 fixed: Release for the 0 A.D. host build's `-O1` (a4078f0fc) |
| spidermonkey | builds as `-D__wasi__` on `wasm64-unknown-wasi`: a detection claim of the porting rules' kind, documented (F11) |
| zero-ad-data, zero-ad-engine | ok |
| zero-ad-deps | copies SDL2's headers and archive and writes its own `sdl2.pc` (version 2.32.10) where `INSTALL sdl2` plus `REQUIRES HOST touch@0` would do; `audio@0`, `display@0`, `input@0` dead until then (F12) |
| zero-ad | ok; F8 (`zero-ad.slop`) |
| zsh | ok |

## Fixes

1. `27523f9fa` Games: raylib's rtext at -O2, no libm shim, no -fno-builtin or int128 flags.
   Four September workarounds (9c6699d2f, 1f2954b6c): raylib's `rtext.c` compiled at `-O0`
   for a compiler limit that is gone (compiles at -O2, 1.9 -> 1.8 MiB); gamedev-sdk's
   `/usr/lib/libm.a` of double-precision wrappers (`fabsf`, `sqrtf`, `abs`, ten more)
   shadowing musl's, while the toolchain resolves `-lm` itself (fingers links `-lm` from
   system-tools, which has no `libm.a`); `-fno-builtin` on raylib, Box3D and bhop;
   `-U__SIZEOF_INT128__` on Box3D, Lua 5.5 and Slopyard (only Box3D's verstable uses int128,
   for a 64x64 multiply). Rebuilt raylib, box3d, gamedev-sdk, slopyard, bhop (249 s) with
   their self-checks (`slopyard --check`, bhop.mk `check`); source suite 467/467.
   Browser: `npm run test:demos -- bhop` passed in Chromium (216 s; the test runs Chromium
   only). Slopyard's browser test needs a GPU window (Vulkan) and was not run: the change does
   not touch its GPU path, and its `--check` self-test ran in the build.
2. `896be41ca` Dead host declarations and glib's build tools:
   `download@0`/`upload@0` in x11-build, gtk-build, mesa-build, which nothing records (no
   transfer tools in them); glib's `http@0`/`sockets@0`, there only because it `INSTALL`ed
   meson, pkgconf, xz, tar and binaryen, build tools whose records every installer of glib
   (gtk-build, ghostty-gtk) then carried: they are `USE` rows now, and the two declarations go.
   The lint found the cause (`glib:15: meson needs REQUIRES HOST http@0, sockets@0`).
   Measured on the rebuilt glib: `/etc/dolly/installed` lists libffi, pcre2, zlib where the
   evening round's listed libffi, cc, python, ninja, meson, pkgconf, xz, tar, binaryen, pcre2,
   zlib (a compiler and Python came with every install of glib); its executables record
   `dso@0 threads@0`, which it declares. x11-build's records: `dso@0 http@0 sockets@0
   threads@0` plus the two an opened image needs, exactly its declarations now. The x11 set
   (x11-build and twelve images on it, glib) rebuilt in 600 s.
3. (in 896be41ca) xterm: `INSTALL libterminfo` was the only package record in these demos naming a library
   its program links statically (tmux, zsh take it with `USE`); it is `USE` now and xterm
   carries NetBSD's licence itself. Rebuilt xterm and x11-desktop (in the Neovim invocation):
   xterm's record is empty, x11-desktop no longer holds `libterminfo.a`, `term.h`, `termcap.h`.
4. `a5d603cd8` Neovim at `-O2` (lua, nvim; P1's Neovim half): Lua, LPeg, luv, utf8proc, tree-sitter,
   Neovim (`Release -O2` for `Debug -O0`) and the parsers. Built in the same invocation as
   libevent's comment fix (tmux's binary is byte-identical before and after, 1,568,913 bytes):
   `nvim` 10,280,033 -> 8,094,322 bytes, `lua` 2,281,617 -> 2,222,431, `liblua.a` 311,460 ->
   248,976, the C parser 658,890 -> 646,316; nvim's recipe checks (a buffer written and read,
   a Slop child, a job with stdin, seven parsers) passed in the build. Browser: the neovim
   demo test passed in Chromium (6.6 s). Timing in the new image (`nvim-timing-browser.mjs`,
   Chromium, three rounds): a Lua loop of five million iterations in 34-36 ms; the -O0 image
   is not in this tree any more, so the before number is the next round's to take.

   gtk-build (399,296,468 bytes) and mesa-build (429,039,642) rebuilt with the two
   declarations fewer; ghostty-gtk's build then died in libadwaita's Meson step with Chrome's
   `Target crashed`, the process-memory crash the integrator reported at 00:10. Merged
   `integrate/2026-11-02` (64491fd72, the revert) as ac06673c8, `npm run build:runtime` (14 s,
   image inputs still fe5261db), and the whole-catalog run below rebuilt ghostty-gtk and
   ghostty-x11.
5. pixman's comment (F15) and xorg-server's `-D__stub_memfd_create` (F14) corrected: commit
   05f9f4648; pixman, xorg-server and x11-desktop rebuilt in the whole-catalog run, the x11
   demo test passed again in Chromium (40 s); ghostty-x11 in the 9 GB run.
   The whole-catalog run that followed (plain `npm run image`, 6 GB slot, 00:13) rebuilt 15
   images (pixman, xorg-server, x11-desktop, slopyard, gpu-fluid, xonotic and the pi chain the
   merge repinned) and lost four to `Target crashed` again: ghostty-gtk, zero-ad, pi-local and
   lean-std, the four largest builds, with the reverted runtime in place (`dolly-build-id.mjs`
   b979c6eb, the same as integrate's). That is the 6 GB cap killing Chrome's renderer, not the
   kernel: the evening round built the first three in the integrator's larger scope. The rerun
   in a 9 GB `bigbuild` slot (00:16-01:35) built pi-local and lean-std and lost ghostty-gtk
   (in Zig's parallel compile), dollyfile-studio (1.69 GB) and zero-ad (1.94 GB) at the
   page's "verifying completed image" step, each with the user journal's "A process of this
   unit has been killed by the OOM killer" for the slot's scope (00:18, 00:29, 01:35): the
   cap, measured. They need the next catalog round in the integrator's scope; so does
   ghostty-x11, which waits for ghostty-gtk. gtk-build and mesa-build, the two recipes of fix 2
   that these depend on, are built and sealed.

6. ENTRY scripts named `init.slop` (F8 fixed rather than kept): `docs/agent-frontend.md` shows
   an embedding's `boot()` writing `/etc/dolly/init.slop` over the image's, which only works
   when ENTRY runs that file; slopyard, gpu-fluid (both generated recipes: the generators
   changed), xonotic and zero-ad ran `/etc/dolly/NAME.slop`. Commit 91df1890c; slopyard,
   gpu-fluid and xonotic rebuilt in the whole-catalog run, zero-ad in the 9 GB run; their GPU
   browser tests not run (sealing checks the retained ENTRY file; the script's content is
   unchanged).

Browser runs after the Neovim set (`test:demos -- x11`, `tmux`, `neovim`, Chromium): x11
passed (39 s: X server frame 3.7 s after navigation, xeyes 88 ms behind the pointer, a drag at
45 frames/s, ImGui 53 frames/s, tmux installed with amy inside xterm); neovim passed; tmux
failed at `amy install vi` inside a pane ("vi: command not found"): `vi` is a core package the
narrowed catalog of this tree did not list, not a tmux change (tmux's binary is byte-identical).
Rerun on the whole catalog (00:15): tmux passed in Chromium (21.6 s) and Firefox (13.3 s),
with its package and `ps` tests in both; x11 passed in Chromium (40.2 s) on the rebuilt
xorg-server and x11-desktop; x11 also passed in Firefox (41.2 s: a drag at 51 frames/s, ImGui
55 frames/s). Source suite after every commit: 467/467.

## State, 2026-11-03 01:45

Done: the table above, six fixes in five recipe commits (27523f9fa, 896be41ca, a5d603cd8,
91df1890c, 05f9f4648) plus the merge ac06673c8, every image of these demos rebuilt in
`work/recipes-apps` except the four that exceed a 9 GB slot (above). Left for the next
round: those four; the findings F3-F15 as written; P1 for the integrator. The tree's own
files are 21.6 GB after `work/disk.sh` (2.3 GB linked) and the removal of the builders'
Chrome profiles and other demos' staging trees.

The x11 demo test's first run (Chromium) passed the X server, xeyes, a window drag, typing
into xterm and ImGui's frames, then timed out at `amy install tmux` inside xterm: at that
moment `dist/dolly-images.mjs` had been rewritten without tmux by a build I had stopped
(below, Lessons), not by the x11 change. Rerun after the Neovim set: below.

## raylib 6.0's software renderer

None of the audited recipes hits the four rlsw behaviours (blend modes, additive wrap,
`DrawPoly`, `LoadImageFromScreen`): bhop draws rectangles, cubes, cylinders, lines and text
and mixes colours with its own `blend()`; Slopyard draws through `gpu@0` and copies raylib's
framebuffer (`rlCopyFramebuffer`). Only Studio's recordings are affected (not audited here).

## Findings kept as findings (each a few lines; none changes a base or the language)

- F3 mesa-build: Mesa's GLSL parsers are generated on the host (`prepare-mesa.sh`, a bootstrap
  exception) while the catalog has `yacc` (byacc) and `flex`. Mesa's grammars use Bison-only
  declarations (`%define api.pure`, `%locations`, `%parse-param`); byacc accepts some. To try:
  a `bison` package, or byacc with `-b`/`-P`; a Mesa rebuild is 1-2 hours.
- F4 ghostty-x11, x11-desktop: `until test -e /tmp/.X11-unix/X0 || test $tries = 3000` spawns
  `/bin/test` (not a Slop builtin) up to 6000 times while the server starts; sbase's `sleep`
  takes whole seconds (`estrtonum`), so `sleep 1` would cost up to a second of start-up instead.
  A fractional `sleep` in the core would make the plain `until ...; do sleep 0.1; done` possible.
- F5 mojo: 480 lines of C (`runtime.c`, `gpu.c`) are `FILE` bodies inside the recipe; every
  other demo stages its port files as a `SOURCE` tar. Moving them is a mojo rebuild (hours).
- F7 optimisation levels: fixed for sdl2, imgui-x11, libjpeg and openal (below, "F7, the
  optimisation levels"); zero-ad's three probes stay at `-O1` (each runs once in its build).
- F8 ENTRY scripts: slopyard, xonotic, zero-ad and gpu-fluid name theirs `/etc/dolly/NAME.slop`;
  the other fourteen applications and docs/dollyfile.md say `init.slop`. Three of the four are
  GPU images (1-2 GiB) whose tests need a GPU window; not rebuilt tonight for a file name.
- F9 speech-to-text, voice: the same compile and link block (four archive paths under
  `/usr/lib/transcribe`) in both; `-L/usr/lib/transcribe -ltranscribe -lggml -lggml-cpu
  -lggml-base` would read better. Cosmetic.
- F11 spidermonkey: built with `CC='cc -D__wasi__'` on `--target=wasm64-unknown-wasi`: a
  detection claim of the kind the porting rules forbid for Linux and AMD64, chosen because
  mozbuild knows no Dolly. A `dolly` OS in mozbuild's tables would be the first-principles port.
- F12 zero-ad-deps: copies SDL2's headers and `libSDL2.a` out of the sdl2 package and writes
  its own `sdl2.pc` (equivalent to the package's today, `Version: 2.32.10`) instead of `INSTALL sdl2`, which carries the real
  `sdl2.pc` and the licence; the toolchain already declares three of sdl2's four modules
  (`touch@0` missing). Smallest diff: replace the two `COPY`s, the `FILE sdl2.pc` and the
  licence `COPY` by `INSTALL sdl2` and `REQUIRES HOST touch@0` (-9 lines). It rebuilds
  zero-ad-deps, zero-ad-engine (about 3 hours in a 9 GB slot) and zero-ad, whose test needs a
  GPU: for a round with the GPU procedure.
- F13 fingers-build: a `PACKAGE` with a toolchain's name, because the application took
  `fingers`; the catalog convention gives the package the plain name. A rename changes the
  application's route.
- F15 pixman: the comment gives `meson install --no-rebuild` the reason "Dolly's Python has no
  os.geteuid"; it has one now (`python3 -c 'import os; os.geteuid'` in x11-build, Chromium).
  The flag only spares Meson a second run of the build that just ran; the comment should say
  so (one line, with the next pixman rebuild; gtk-build and mesa-build use the flag without
  the claim).
- F14 xorg-server: `-Dc_args='-D__stub_epoll_create1 -D__stub_memfd_create'` says both are
  libc stubs; `libc-ww.a` holds `epoll_create1` and no `memfd_create` at all (Meson's link
  check fails on its own), so the second define is moot: one token to drop with the next
  xorg-server rebuild (xorg-server, x11-desktop, ghostty-x11 follow).
- F6 nvim's welcome text says PTY terminals are unsupported: true for this build (no
  `pty@0`, libuv's pty path not ported), so not stale; recorded for the day `:terminal` is wanted.

## Proposals

- P1 cmake at `-O0`: CMake, libuv (`libuv-dolly.mk`), Lua, LPeg, luv, utf8proc, tree-sitter,
  Neovim (`Debug -O0`) and its parsers are built at `-O0` since the 2026-09-07 checkpoint
  (1f2954b6c, "Checkpoint source-built Neovim and independent compiler images"), when the
  in-sandbox compiler could not optimise every unit (raylib's `rtext.c` rule is the same
  era). The Neovim side is fixed below (lua, nvim at `-O2`). CMake is left: `cmake-build` is
  the base of about sixty images (sdl2, tablegen, rust-llvm, mojo-llvm, zig-llvm, every CMake
  package), so the change is a catalog round; measured tonight in `default` after
  `amy install cmake` (Chromium): a one-file project configures in 1.6 s (0.7 s warm) and
  builds in 0.4 s, CMake's own evaluation and generation of 300 targets in 4.3 s (`cmake-timing-browser.mjs` in the evidence directory). Smallest diff: in
  `demos/cmake/Dollyfile-cmake`, `CFLAGS=-O0 CXXFLAGS='-O0 -std=c++17'` -> `-O2`, drop
  `-DCMAKE_BUILD_TYPE=Debug -DCMAKE_C_FLAGS_DEBUG=-O0 -DCMAKE_CXX_FLAGS_DEBUG=-O0` for
  `-DCMAKE_BUILD_TYPE=Release`; `demos/cmake/libuv-dolly.mk` `CFLAGS = -O0` -> `-O2`.
  The same recipe bootstraps with `--parallel=1` and builds with a plain `make cmake`, one
  compile at a time, where every other recipe uses `-j4`: the round that takes the `-O2`
  change can take `-j4` too and measure the image's build time against the evening round's.

P1 done on `audit/cmake-o2` (2026-11-03, the integrator; 5ecb73b00): the smallest diff above with
`--parallel=4` and `make -j4`. libuv and cmake built in 532 s in a 9 GB slot (402 s on a quieter
machine), `cmake-build` in 22 s; `demos/cmake/test/cmake-browser.mjs` passed in Chromium and
Firefox (30 s each). Measured in the same tree and image (`cmake-build`, Chromium, three runs each,
`work/evidence-2026-11-03/cmake-baseline/`): 300 targets configure in 1.38-1.51 s at -O2 against
2.04-2.14 s at -O0; a one-file project configures in 0.32-0.37 s against 0.38-0.41 s and builds in
0.23-0.25 s against 0.19-0.21 s (the build starts cmake several times; not explained tonight). The
commit message's "4.3 s at -O0" came from `default` after `amy install cmake` under other load and
overstates the gain. The recipes on cmake-build (the LLVM builds among them) are repinned: the next
round builds them.

## F7, the optimisation levels (2026-11-03 afternoon, branch `audit/sdl2-o2`)

Branch from `demo/phone-menu` (edaca025c), in `work/sdl2` with `work/phone`'s images; image
inputs as built there. Evidence in `build/sdl2-evidence/` (not committed): the logs, the
benchmarks (`sdl2-bench.c`, `jpeg-bench.c`, `openal-bench.cpp`), their drivers
(`sdl2-levels-browser.mjs`, `lib-levels-browser.mjs`) and each level's archive.

Origin. No commit, task or comment gives a reason for any of the four `-O1`s:

- sdl2: `-DCMAKE_C_FLAGS_RELEASE=-O1` came with SDL2's first recipe (`Dollyfile-sdl2-build`,
  4b4419628, 2026-09-08, the Seven Kingdoms arena), in the commit that also built the game and
  its viewer at `-O1`; 8bfcd8843 only renamed the toolchain to the package. The low levels of
  that month were chosen for cold-build time (`tasks/20260930-100000-audit-41`, section 3,
  which also measured `-O1` "not a cheaper middle: same speed as -O2 at nearly the same compile
  cost"). imgui-x11 copied the line with its "as the sdl2 package configures it" (8fdbb347e).
- libjpeg: the level of Xonotic's makefile (`CFLAGS := -O1`, `demos/xonotic/Makefile`), carried
  when libjpeg became a package (3377665e7).
- openal: the `common` CMake flags of the 0 A.D. host build (2fd9966c0, 2026-09-23, Emscripten
  outside Dolly), carried into the Dolly recipe (d45c3c398).

Method. Each package was built at its old level and the new one in this tree; the archives
were taken out of the snapshots and served to one session (`installProbe`: system plus the
package), which linked one benchmark against each and ran them in alternation, so the
machine's load (the evening round in `work/integrate`) fell on every level alike. Every
benchmark prints a checksum of its output: it was the same at every level (no miscompile).

| Package | Change | Archive bytes | Measured (median, same session) |
| --- | --- | --- | --- |
| sdl2 | `-O1` -> Release (`-O3 -DNDEBUG`) | 1,249,210 -> 1,246,294 (`-O2`: 1,214,574) | 1280x720 ARGB8888 to RGB565 conversion 1.34-1.75 ms -> 0.95-1.25 ms per frame (every round); textured geometry, scaled sprites and ImGui's frames/s within the noise (pooled ImGui medians: Chromium 141/150/145 frames/s at -O1/-O2/-O3, Firefox 164/174/161; eight O2/O3 rounds 163/156, spread 97-211) |
| imgui-x11 | `-O1` -> Release | `imgui-x11` 3,074,348 -> 3,061,394 | x11 test, twice per browser: drag 48-52 -> 46-51 frames/s, ImGui 54-57 -> 52-56: at the display's rate, and the page's own ready time rose by the same share (load) |
| libjpeg | `-O1` -> `-O2` | 288,672 -> 297,962 | 1600x900 at quality 90: encode 23.7/24.3 ms, decode 12.5/11.8 ms (Chromium), 24.2/24.3 and 11.6/12.3 (Firefox): no difference |
| openal | `-O1` -> Release | 3,148,334 -> 3,125,126 | sixteen sources over a loopback device: 2.49/2.61 ms per second of audio (Chromium), 4.22/3.18 (Firefox) |

Decision: sdl2, imgui-x11 and openal take CMake's Release flags, like the thirteen CMake
recipes that set no override (sdl2-image, sdl2-mixer, sdl2-ttf, freetype, libpng, fmt,
libxml2, libogg, libvorbis, binaryen, cmake, llvm-tablegen, gtk-build; nvim and transcribe pin
`-O2`, wabt and llama-cpp `-O1`); `-O2` measured no faster than `-O3` and 2.6%
smaller, too little to justify an override line of its own. libjpeg takes `-O2`, the level of
every other hand-written package makefile; it buys nothing measured and costs 9 KB, and an
`-O1` would need a reason in the recipe, which nothing gives. Build times did not change
(sdl2 64-74 s at every level; openal 168 s). A `CMAKE_C_FLAGS_RELEASE` override also drops Release's
`-DNDEBUG`: OpenAL's `assert`s ran in the `-O1` build and are compiled out now, as in upstream's
release builds (SDL2's `SDL_assert` does not read `NDEBUG`).

Commits and checks:

- bdf48848a sdl2 at Release. `npm run test:demos -- sdl2`: sdl2 (Chromium, 12.5 s), imgui and
  sdl2 audio in Chromium and Firefox (10.1/12.5 s, 15.8/15.4 s).
- fd60552c9 imgui-x11 at Release: x11-desktop, xorg-server (Xsdl on the new sdl2) and
  imgui-x11 rebuilt; `demos/x11/test/x11-browser.mjs chromium firefox chromium firefox` passed
  on both levels.
- b6c539c10 libjpeg at `-O2`; a4078f0fc openal at Release (its recipe's loopback check passed in
  the build).

Left at `-O1`: zero-ad-deps' ENet and OpenAL probes and zero-ad-engine's SpiderMonkey probe
(each compiled and run once in its build; the level does not reach a shipped program), and,
outside these four packages, Xonotic's engine (`demos/xonotic/Makefile`, where libjpeg's came
from), gmqcc, wabt and llama-cpp: the same unrecorded pattern, each a rebuild of a GPU or
large image, for a round that measures them.

Consumers rebuilt on the new packages and tested (the tree's whole list, 96 images with the
closure, in 257 s for the eleven that changed): `npm run test:demos -- fingers bhop classicube
rts` passed (bhop 186 s, rts 289 s, classicube 290 s in Chromium, as those tests run; fingers in
Chromium and Firefox); `test/amy-browser.mjs`'s sdl2-ttf, sdl2-image and openal rows, run alone
in `default` after `amy install cmake pkgconf` and each package (`sdl2-packages-browser.mjs`),
passed in Chromium and Firefox. xonotic-build (libjpeg, sdl2) and zero-ad-deps (openal) rebuilt too (106 s):
`demos/xonotic/test/xonotic-browser.mjs` headless, the client in the engine's software
rasterizer (gpu@0 has no adapter there), passed in Chromium (512 s: the server benchmark, the
menu, a bot match, its timedemo at 12.5 frames/s, sound); `0ad-openal-browser.mjs` ran
zero-ad-deps' OpenAL probe in Chromium (34 and 17 ms).

For the next catalog round: every consumer of the four packages. Built and tested here: sdl2,
sdl2-mixer, sdl2-image, sdl2-ttf, imgui, imgui-x11, xorg-server, x11-desktop, libjpeg, openal,
raylib, gamedev-sdk, bhop, classicube-build, classicube, rts-build, rts-arena, fingers-build,
fingers, xonotic-build, zero-ad-deps. Not built here, with the GPU stage: xonotic (on
xonotic-build), zero-ad-engine and zero-ad (on zero-ad-deps; zero-ad-deps copies SDL2's archive,
F12), and ghostty-gtk and ghostty-x11, stale in this tree from the branch's own base; zero-ad's
and ghostty-gtk's builds exceed a 9 GB slot (above).

## Shared findings (recorded by both audits)

- S1: 43 `rm -rf /tmp/...` steps in these recipes (and 20 more in the core's): `/tmp` is never
  retained ("scratch needs no cleanup"), so a final `rm` frees nothing; a mid-build `rm` of a
  large archive (mojo-llvm) frees memory and stays.
- S2: the core `tar` restores no mtimes; Emacs compiles a 12-line `utimensat` program to make
  the release's generated files current. A tar that restores mtimes (a seed change) removes it.

## What the images keep (criterion 4)

Every application here is its base plus its program and data: the compiler
(`/usr/libexec/dolly/process-bin/compiler`, 91.6 MiB) and libc++ (7.9 MiB) of `system` are
the largest files of fourteen of them, which is base content, the owner's. Libraries and
objects outside the toolchain are 1.8-9.8 MiB per image and in use (SDL2 and raylib for the
viewers and the in-image `make` the games' `.dollyrc` invites; curl, zlib, libdisplay from
the base); `/usr/src` holds the game ports (bhop 2.1 MiB, slopyard 3.5 MiB, rts-arena 6.7 MiB
of Seven Kingdoms, which the agents read and rebuild). No build leftovers were found. The
largest demo images are their data: zero-ad 1842 MiB of game content, xonotic 1068 MiB of pk3,
rts-arena 119 MiB of 7kaa resources, pi-phone's 129 MiB Parakeet model.

## Tests (criterion 8)

Every image of these demos is named by a browser test or an `amy-browser.mjs` row except the
six build-only toolchains (classicube-build, mesa-build, mojo-llvm, rts-build, wine-build,
x11-build), whose outputs the consumers' tests open. Sources: every `SOURCE` has its row in
`config/upstreams.json` (`test/upstreams.test.mjs` enforces it; `docs/licences.md` is the audit
over that file), every demo's `prepare-sources.sh` is guarded by `has_image`.

## Base of the branch

`integrate/2026-11-02` at 71d2603fc; the integrator's 00:10 note (the process-memory revert
2f8d93609 on 64491fd72, kernel C and page JavaScript only, image inputs fe5261db unchanged)
needed no merge here: no build of the night crashed Chrome (`Target crashed` in no log).
P1 (CMake at -O0) is a catalog-round decision, left in this task for the integrator.

## For the next catalog round

ghostty-gtk, ghostty-x11, zero-ad and dollyfile-studio: their recipes changed only by the
declarations, `init.slop` and pins above (ghostty-gtk by its base mesa-build's pin), and their
builds exceed a 9 GB slot. Every other image of these demos is built in this tree with the
merged runtime (b979c6eb) at image inputs fe5261db. GPU browser tests not run tonight: slopyard,
gpu-fluid, xonotic, zero-ad (no display number in the brief).

## Lessons

- A Dollyfile `FILE` body's blank lines are four spaces; the Edit tool strips whitespace-only
  lines, so my first raylib edit ended the makefile body at its first blank line and the build
  stopped at `.PHONY:` "unknown directive". Edit recipe bodies with sed or python, and run
  `update-recipe-pins.mjs` (which parses every recipe) before any build.
- `work/slot.sh` runs its command in a transient scope of its own: `systemctl --user stop` of
  the service that called it stops the shell and leaves the build running. The orphan rewrote
  `dist/dolly-images.mjs` with its own image set a minute later, which made the next build fail
  on `nvim` and `tmux` ("usage: build-snapshot-browser.mjs IMAGE OUTPUT": the image was not in
  the catalog) and the x11 test's `amy install tmux` time out. Stop the scope
  (`systemctl --user list-units --type=scope`), and never chain two `npm run image` calls
  with `&&` when one may have to be interrupted.
- One tree runs one `npm run image` at a time, and `generate-routes` narrows the catalog at
  every start: a browser test in the same tree must open an image the current invocation
  names, so every invocation of the night named the union of what was built before.
- Declarations are measured in minutes: a 60-line script that reads each snapshot's
  `dolly.host` records and compares them with `REQUIRES HOST` found every dead declaration;
  the lint's completeness error on the first removal (`meson needs http@0, sockets@0`) pointed
  at the cause, build tools `INSTALL`ed instead of `USE`d, whose records every consumer then
  carried. A dead declaration is a symptom; find what put it there.
- `Target crashed` in a build log is Chrome's renderer dying, and the slot's memory cap kills
  it as readily as a kernel bug: ghostty-gtk, zero-ad and dollyfile-studio died under 6 GB and
  again under 9 GB with the reverted runtime in place (the build id matched integrate's), and
  `journalctl --user` named the OOM killer each time. Check the journal before blaming the
  kernel, and give a 1.7-2 GB image's capture the integrator's scope.
- The September workarounds (`-O0` units, `-fno-builtin`, a `libm.a` shim, `-U__SIZEOF_INT128__`)
  carried no reason in the recipe; `git log -S` found the checkpoint commits, and the
  measurement that retired them was a four-minute rebuild. A flag that works around a compiler
  of the day needs its reason and the condition for removing it next to it.

- A level comparison is only readable inside one session: the evening round's load moved
  every number by up to 25% between runs, more than any `-O` level did. Taking each level's
  archive out of its snapshot (`resolveSnapshotFile`, ten lines), serving the archives as test
  fixtures and linking one benchmark against each in the same session, run in alternation, made
  the levels comparable; a checksum of each benchmark's output made the same runs the
  miscompile check.
- Display-paced numbers cannot show a library's level: the x11 test's drag and ImGui frames sit
  at the display's rate at `-O1` and `-O3` alike. A program that outruns the display
  (imgui-demo, 140-200 frames/s on Dolly's display) or an offscreen benchmark can. The page's
  own ready time is a free load gauge: it rose by the same share as the frames fell.
- All four `-O1`s were copies (the Seven Kingdoms commit, Xonotic's makefile, the 0 A.D.
  Emscripten build); `git log -S` to the first commit found each in minutes. A level with no
  reason beside it is usually a line that travelled.
- A tree made from another's images cannot build its whole list until the Rust staging is
  restored: `prepare-rustc-sources.py` keys its outputs on `build/rustc-port/prepare.inputs`,
  which the slim tree lacks, and a missed key deletes the outputs' `.inputs` records. Copying the
  65-byte file and the two records from `work/phone` (outputs byte-identical, `cmp`) restored
  it; the tree setup should copy them.
