# Xonotic

Xonotic 0.8.6 (DarkPlaces engine), being ported to Dolly. State: the dedicated
server, the SDL client and gmqcc build inside Dolly, a bot match runs to its
end headless, gmqcc rebuilds the game logic there, and the client draws on
`gpu@0` at the engine's normal preset, or, where the browser gives no WebGPU
adapter, through the engine's own software rasterizer (its SSE2 code compiled
as Wasm SIMD) into the `sdl2` package's window. Sound plays through SDL's
audio on `audio@0`. The task is `tasks/20261006-122433-xonotic/TASK.md`.

## Images

- `xonotic-build`: the dedicated server (`xonotic-dedicated`), the SDL client
  (`xonotic-sdl`) and the QuakeC compiler (`gmqcc`), compiled from the pinned
  release source with `cc`, `c++` and Make on `system-tools` with the `sdl2`
  package; the engine, gmqcc and `qcsrc` stay under `/usr/src/xonotic`, and
  `make -f /usr/src/dolly/xonotic/Makefile qc` compiles `progs.dat`,
  `csprogs.dat` and `menu.dat` into `/tmp/xonotic/build/qc`.
- `xonotic-shaders`: the engine's shader permutations of the normal preset
  as WGSL in `/usr/share/xonotic/shaders`, for the client's `gpu@0` path:
  `dpshaders.c` rewrites the engine's GLSL as naga's GLSL front end reads it
  and the `naga` package translates it, in the build.
- `libjpeg`: IJG libjpeg 9f, a library for programs the `cc` package builds;
  it brings no compiler.
- `libogg`: Ogg 1.3.5 from upstream's CMake project, a library for programs
  the `cc` package builds.
- `libvorbis`: Vorbis 1.3.7 with vorbisfile and vorbisenc from upstream's
  CMake project, a library for programs the `cc` package builds; it brings
  `libogg`.
- `xonotic`: the client with the release's data, maps and font archives
  (946 MB) under `/usr/share/xonotic/data`; `/xonotic/` starts `xonotic`,
  the client in software at 1024×768, and leaves the shell when it quits.

Build with `npm run image -- xonotic-build` or `npm run image -- xonotic`.

## What works in `/xonotic/` today

- The menu and a bot match on the stock maps at 1024×768; `xonotic` takes
  the engine's command line (`xonotic +map stormkeep +bot_number 4`). With a
  WebGPU adapter the client draws on `gpu@0`; without one, `gpu@0` gives it no
  device and the software rasterizer draws. The image starts with the low
  effects preset (`/home/dolly/.xonotic/data/config.cfg`, overwritten with
  the player's own settings on exit), chosen for the software path: 22.9 fps
  in Firefox on a recording of a running bot match against 12.3 for the
  normal preset, at the cost of deluxemapping, gloss and normal maps, realtime
  dynamic lights, most particles and one texture mip level; the settings menu
  raises them again. Loading stormkeep from the menu takes about 15 s in
  Firefox's software client.
- Keyboard and mouse reach the engine through the sdl2 package's video
  backend: in the menu, in the game's own dialogs and in the game menu a map
  opens into, the page's cursor is hidden and the game draws its own; once
  Escape closes them the engine asks for relative motion and the first click
  in the match captures the pointer (the page shows a crosshair until then;
  Escape releases the capture).
- Not working or not there: network play (single player with bots only), the music and Nexuiz
  compatibility archives, and on `gpu@0` the effects below.

## Effects that are off on `gpu@0`

The `normal` preset draws in full. What the engine asks for beyond it, or in
passing, and what each waits for:

| Effect | Preset | Waits for |
| --- | --- | --- |
| Water reflection and refraction (`r_water`) | `high` and up | clip planes (WebGPU's `clip-distances` feature, which `gpu@0` does not ask for); the views draw, unclipped |
| Corona occlusion queries | `high` and up | occlusion queries, which `gpu@0` lacks; the engine traces instead |
| Realtime world lights and shadow maps | `ultra` and up | drawing into depth textures in `dpgpurast.c` (`gpu@0` has depth targets and compare samplers) |
| Offset and relief mapping | `ultra` and up | nothing in `gpu@0`: their permutations are not in `xonotic-shaders`' list |

A shader permutation outside the list in [`Makefile`](Makefile) draws nothing
and is printed once (`dpgpurast: no WGSL for shader mode M permutation P`).

## How it works

- [`prepare-xonotic.sh`](prepare-xonotic.sh) takes the release's source zip
  (identical to the tags `xonotic-v0.8.6` of DarkPlaces, gmqcc and
  xonotic-data.pk3dir's `qcsrc`) and applies
  [`darkplaces-dolly.patch`](darkplaces-dolly.patch), six hunks under
  `__dolly__`: the dedicated server listens on the in-process loopback, sleeps
  and polls the console without `select`, loads no dynamic libraries (zlib is
  linked; JPEG, PNG, curl, ODE and d0_blind_id report themselves
  unavailable), keeps its session lock an ordinary file and reads large
  plain files in a loop. Those two hunks are from before the kernel had file
  locks and returned a whole `read`; it has both now, and they go with the
  patch's next change.
  Everything else is unchanged upstream; the engine sees `__dolly__`, never
  `__linux__`.
- Without `dlopen`, the libraries the engine would load at run time are
  linked as upstream's Android build links them: IJG libjpeg 9f
  (`LINK_TO_LIBJPEG`), FreeType with its libpng (`DP_FREETYPE_STATIC`) and
  Vorbis with its Ogg (`LINK_TO_LIBVORBIS`), installed from their packages. PNG
  textures, curl, ODE and d0_blind_id stay unavailable.
- Dolly's libc answers the engine's socket calls with failures, so the INET
  ports are reported unavailable; only the loopback address type carries
  packets.
- The engine's software render path (`vid_soft 1`) calls the 41 functions of
  `dpsoftrast.h`; [`dpgpurast.c`](dpgpurast.c) implements them on `gpu@0`,
  with no change to the engine. It draws each frame into a colour and a depth
  texture and copies that onto the surface once; the engine's copies of the
  frame into a texture (its postprocessing, the loading screen's backdrop)
  are draws from that colour texture, and a screenshot presents the frame
  again and reads the surface back (`gpu@0`'s frame capture). It merges
  consecutive draws with the same pipeline, textures and uniforms, keeps a
  static model's arrays in a geometry buffer once a draw has read the same
  bytes twice, and sends one command packet per frame where they fit. Where `dolly_gpu_open`
  fails it forwards every call to `dpsoftrast.c`, compiled with its names
  prefixed `dpsoft_` (the Makefile's `DPSOFTRAST_CALLS`). `vid_sdl.c` keeps
  the window, input and cursor; `gpu@0` draws on its own canvas over it.
- [`dpshaders.c`](dpshaders.c), built in `xonotic-shaders`, writes each shader
  permutation the engine's own way (its prelude over `shader_glsl.h`, through
  `cc -E`) and rewrites the result mechanically for naga's GLSL front end
  (the rules are in the file); naga translates it to WGSL there.
- [`simd-unit.c`](simd-unit.c) compiles the two SSE2 units (`dpsoftrast.c`,
  `mod_skeletal_animatevertices_sse.c`) as Wasm SIMD through a per-function
  target pragma over Emscripten's compat `<emmintrin.h>`, until `cc` accepts
  `-msimd128` (`core/cc-simd`); the client is built with `-DSSE_PRESENT
  -DSSE2_PRESENT` so the engine takes its SSE2 paths and registers `vid_soft`.
- [`Makefile`](Makefile) builds DarkPlaces' `OBJ_SV` unit list (the `*_null.c`
  video, thread and sound units) at `-O1` with 64 MiB of initial memory for
  the engine's static data, the SDL client from `OBJ_SDL` with the null
  thread and CD units and its SDL sound, gmqcc with `-std=c++11`, and the QuakeC programs
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
the test runs its second match on the `progs.dat` built in Dolly. The test
records its live bot match (the engine's `record`, with `maxplayers 8` so
that its menus do not pause the game) and replays the recording as a
timedemo: at 1024×768 and the normal preset, 39.2 fps on `gpu@0` in Chrome
in a 1280×800 window and 14.0 fps in software in Firefox, on one thread.
Under Xvfb each presented frame waits until the X server has the window,
which grows with its area, so the window size goes with every GPU number.
The rates measured before 2026-10-27 replayed `short.dem`, a native
recording of a game its menu had paused: one frame drawn 1,046 times;
numbers in the task.

## Licences

DarkPlaces is GPL-2.0-or-later, the game logic and data GPL-3.0-or-later
(`qcsrc/lib/warpzone` MIT or GPL-2.0-or-later, `lib/csqcmodel` MIT), the
fonts GPL-2.0-or-later with the font embedding exception; the texts are under
`/usr/share/licenses/` in the images and the sources are served beside them.
This software is based in part on the work of the Independent JPEG Group. The
pass over the shipped archives is in the task; `docs/licences.md` has Dolly's
obligations.

## Bootstrap exceptions

None: everything in the images is built in Dolly from the pinned sources,
the WGSL shaders by naga, and the data archives are the release's.

## Native baseline

`build/xonotic-native/` and `build/xonotic-evidence/` in a worktree hold a host
build of the same engine (gcc, SDL2 2.0.20) used for measurement only; it is
never a build input. Measurements are in the task.

Test: `npm run test:demos -- xonotic` ([`test/`](test/)); `DOLLY_BROWSER=firefox`
runs it in Firefox.
