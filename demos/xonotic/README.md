# Xonotic

Xonotic 0.8.6 (DarkPlaces engine), being ported to Dolly. State: the dedicated
server, the SDL client and gmqcc build inside Dolly, a bot match runs to its
end headless, gmqcc rebuilds the game logic there, and the client draws
through the engine's own software rasterizer (its SSE2 code compiled as Wasm
SIMD) into the `sdl2` package's window. That software path is the interim
renderer; the goal stays a `gpu@0` render path inside the engine (the plan is
in the task). No sound yet. The task is `tasks/20261006-122433-xonotic/TASK.md`.

## Images

- `xonotic-build`: the dedicated server (`xonotic-dedicated`), the SDL client
  (`xonotic-sdl`) and the QuakeC compiler (`gmqcc`), compiled from the pinned
  release source with `cc`, `c++` and Make on `system-tools` with the `sdl2`
  package; the engine, gmqcc and `qcsrc` stay under `/usr/src/xonotic`, and
  `make -f /usr/src/dolly/xonotic/Makefile qc` compiles `progs.dat`,
  `csprogs.dat` and `menu.dat` into `/tmp/xonotic/build/qc`.
- `xonotic`: the client with the release's data, maps and font archives
  (946 MB) under `/usr/share/xonotic/data`; `/xonotic/` starts `xonotic`,
  the client in software at 1024×768, and leaves the shell when it quits.

Build with `npm run image -- xonotic-build` or `npm run image -- xonotic`
(the data image's builder needs more than 9 GB during its snapshot upload;
the task records the measurements).

## What works in `/xonotic/` today

- The menu and a bot match on the stock maps, drawn by the software path at
  1024×768; `xonotic` takes the engine's command line
  (`xonotic +map stormkeep +bot_number 4`). The image starts with the low
  effects preset (`/home/dolly/.xonotic/data/config.cfg`, overwritten with
  the player's own settings on exit): 31 fps in Chromium on the test's
  bot-match demo against 13 for the normal preset, at the cost of
  deluxemapping, gloss and normal maps, realtime dynamic lights, most
  particles and one texture mip level; the settings menu raises them again.
  Loading a map takes about two minutes in the software client; the
  loading plaque stays up meanwhile.
- Keyboard and mouse reach the engine through the sdl2 package's video
  backend: in a match the engine asks for relative motion and the page
  captures the pointer on the first click (Escape releases it); in the menu
  and in the game's own dialogs the page's cursor is hidden and the game
  draws its own.
- No sound (the client has the null sound unit), no network play, and the
  music and Nexuiz compatibility archives are not in the image.

## How it works

- [`prepare-xonotic.sh`](prepare-xonotic.sh) takes the release's source zip
  (identical to the tags `xonotic-v0.8.6` of DarkPlaces, gmqcc and
  xonotic-data.pk3dir's `qcsrc`) and applies
  [`darkplaces-dolly.patch`](darkplaces-dolly.patch), six hunks under
  `__dolly__`: the dedicated server listens on the in-process loopback, sleeps
  and polls the console without `select`, loads no dynamic libraries (zlib is
  linked; JPEG, PNG, curl, ODE and d0_blind_id report themselves
  unavailable), keeps its session lock an ordinary file (Dolly has no file
  locks yet) and reads large plain files whole (Dolly's `read` returns at
  most 1 MiB per call until `core/full-read` lands; that hunk goes with it).
  Everything else is unchanged upstream; the engine sees `__dolly__`, never
  `__linux__`.
- Without `dlopen`, the libraries the engine would load at run time are
  linked as upstream's Android build links them: IJG libjpeg 9f, built in
  the image from its pinned source (`LINK_TO_LIBJPEG`), and FreeType with its
  libpng copied from the `zero-ad-deps` build (`DP_FREETYPE_STATIC`). PNG
  textures, Vorbis, curl, ODE and d0_blind_id stay unavailable.
- Dolly's libc answers the engine's socket calls with failures, so the INET
  ports are reported unavailable; only the loopback address type carries
  packets.
- [`simd-unit.c`](simd-unit.c) compiles the two SSE2 units (`dpsoftrast.c`,
  `mod_skeletal_animatevertices_sse.c`) as Wasm SIMD through a per-function
  target pragma over Emscripten's compat `<emmintrin.h>`, until `cc` accepts
  `-msimd128` (`core/cc-simd`); the client is built with `-DSSE_PRESENT
  -DSSE2_PRESENT` so the engine takes its SSE2 paths and registers `vid_soft`.
- [`Makefile`](Makefile) builds DarkPlaces' `OBJ_SV` unit list (the `*_null.c`
  video, thread and sound units) at `-O1` with 64 MiB of initial memory for
  the engine's static data, the SDL client from `OBJ_SDL` with the null
  thread, sound and CD units, gmqcc with `-std=c++11`, and the QuakeC programs
  the way `qcsrc/Makefile` and `tools/qcc.sh` do: `cc -xc -E`, the line
  markers turned into gmqcc pragmas, then gmqcc. The results differ from the
  release's `.dat` files only in `__LINE__`-derived strings, because clang
  places line markers where the release's gcc emitted blank lines.

## Data

The release's `data/*.pk3` archives (1.2 GB) are pinned; the `xonotic` image
takes four of them as one `SOURCE` each (`data`, `maps` and the two font
archives, staged by [`prepare-sources.sh`](prepare-sources.sh) from
[`prepare-xonotic-data.sh`](prepare-xonotic-data.sh), which extracts them from
the pinned zip into `.cache/xonotic/release/Xonotic/data`); the music and the
Nexuiz compatibility archives are left out. The browser test runs on
`xonotic-build` and fetches the same archives through its fixture server into
`/home/dolly/xonotic/data`, which is the test's arrangement. The compiled
`progs.dat`, `csprogs.dat` and `menu.dat` inside `data.pk3` are the release's;
the test runs its second match on the `progs.dat` built in Dolly. The test's
`short.dem`, a 22 s bot match on stormkeep recorded with the native build, is
a measurement fixture and not in any image: the software path plays it at
1024×768 on one thread at 13.7 fps in Chromium and 16.1 fps in Firefox
(native llvmpipe: 76 fps). An earlier 30 and 43 fps was measured before
libjpeg was linked, when the surfaces drew untextured; numbers in the task.

## Bootstrap exceptions

None today: everything in the images is built in Dolly from the pinned
sources, and the data archives are the release's. Planned: the GLSL shader
permutations translated to WGSL on the host at preparation time, as 0 A.D.'s
`toolchain/prepare-shaders.sh` does.

## Native baseline

`build/xonotic-native/` and `build/xonotic-evidence/` in a worktree hold a host
build of the same engine (gcc, SDL2 2.0.20) used for measurement only; it is
never a build input. Measurements are in the task.

Test: `npm run test:demos -- xonotic` ([`test/`](test/)); `DOLLY_BROWSER=firefox`
runs it in Firefox.
