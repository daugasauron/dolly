# Port Xonotic: DarkPlaces over gpu@0, built inside Dolly

- STATUS: OPEN
- PRIORITY: 240
- TAGS: demo,gpu,audio,port

Owner (2026-10-06), asking for a game to show off: "Something similar to doom
to showcase like game engine/physics performance with shaders? Ideally
something visually striking." Then: "I like Xonotic", and "Add a task to tatr
to do this port."

Xonotic is an arena shooter on the DarkPlaces engine. Bot matches run client
and server in one process, so they need no sockets. Nothing has been built or
run for this yet: the measurements below are of upstream's source only.

## Licence (read 2026-10-06)

- Xonotic's `COPYING`: everything in official releases and team-owned branches
  is GPL-3.0-or-later; DarkPlaces is GPL-2.0-or-later; some `qcsrc/` code
  carries other licences in `COPYING` files there. Files the game downloads
  from servers at run time are outside the grant.
- Handled like Seven Kingdoms and 0 A.D. (`docs/licences.md`): Dolly files
  compiled into the engine carry `SPDX-License-Identifier: GPL-2.0-or-later`,
  the source archives and recipe are served beside the image, and
  `config/upstreams.json` gets the rows.
- Not done: a pass over the data repositories for single assets under other
  terms. **Owner** decides on anything it finds.

## Measured upstream (2026-10-06)

DarkPlaces `d93f9c42` (master of gitlab.com/xonotic/darkplaces, 2026-01-22), by
grep over a shallow clone. The release tag `xonotic-v0.8.6` (`f244ef25`) was
not inspected.

- 202,441 lines in the top-level `*.c` and `*.h`.
- Render paths: `RENDERPATH_GL32` and `RENDERPATH_GLES2` only. There is no
  Vulkan or software renderer, so 0 A.D.'s "upstream backend over `gpu@0`"
  does not carry over.
- OpenGL surface: 112 distinct `qgl*` functions at 510 call sites in seven
  files: `gl_rmain.c` 233, `gl_backend.c` 176, `gl_textures.c` 65,
  `vid_shared.c` 16, `r_shadow.c` 15, `cl_screen.c` 4, `vid_sdl.c` 1.
- Shaders: one GLSL source, `shader_glsl.h` (1,811 lines), compiled per mode
  and permutation; 17 modes. The permutations a preset uses were not counted.
- The engine can use what `gpu@0` lacks today: up to four colour attachments
  (deferred lighting), 16- and 32-bit float colour buffers, stencil
  operations, 3D textures, occlusion queries, alpha-to-coverage and
  framebuffer blits. Its own defaults keep them off (`r_shadow_deferred 0`,
  `r_viewfbo 0`, `r_bloom 0`, `r_water 0`, `r_coronas_occlusionquery 0`,
  `vid_samples 1`); what Xonotic's presets set was not inspected. Shadow
  mapping is on by default and fits compare samplers; DXT1/3/5 fits
  `FEATURE_TEXTURE_BC`.
- Platform files: `vid_sdl.c`, `snd_sdl.c`, `thread_sdl.c`, `sys_sdl.c`, each
  with a `*_null.c` twin (the dedicated server). Upstream also has an
  Emscripten target (`sys_wasm.c`) on the GLES2 path.
- `LHNETADDRESSTYPE_LOOP` is the in-process server's address type.
- Libraries by `LINK_TO_*`: zlib, libjpeg, libvorbis, ODE, d0_blind_id (with
  GMP) and libxmp; `makefile.inc` also names libpng and libcurl. Dolly builds
  zlib and curl; `zero-ad-deps` builds libpng, libogg, libvorbis and FreeType.

Xonotic 0.8.6 (xonotic.org/download): `xonotic-0.8.6.zip`, 1182 MiB, source
included; it lists OpenGL 2.1 as the requirement.

## Pinned (2026-10-07)

Xonotic's current release is 0.8.6 (dl.xonotic.org lists nothing newer).
`config/source-pins.sh` carries both archives; the sizes and SHA-256 were
measured on the downloads, and `xonotic-0.8.6.zip` also matched the SHA-512 in
the published `xonotic-0.8.6.sha512`.

| Archive | Bytes | SHA-256 |
|---|---|---|
| `xonotic-0.8.6.zip` (data pk3s, binaries, source) | 1,238,439,495 | `50850f8d800e7499722f6ea61e478e96464a375494b5a24da93aa0598cbe964d` |
| `xonotic-0.8.6-source.zip` (engine, gmqcc, d0_blind_id, qcsrc) | 6,580,743 | `8b92ac781cff4ae89c121a23eacd7dec05a2aabedaccc23a19d1a0958b4012a8` |

The source zip's trees were diffed against shallow clones of the tags:
`darkplaces` = `xonotic-v0.8.6` = `f244ef2525c9c018f1b077d49959df3c77ebc7b1`
(no differences), `gmqcc` = `2fe0af00e78d55edecd7ca7ee1808c4ea946b05f` (no
differences), `qcsrc` = xonotic-data.pk3dir `xonotic-v0.8.6` =
`45df581bba67832b61e5041f4b7d87cf59c80657` (no differences, from GitLab's
`?path=qcsrc` archive), `d0_blind_id` = `c32ee93edd10288ca40e1eb81263f0a37309b32c`
(the zip adds autotools output). The xonotic.git tag is `0100f2c8d794…`.
The release engine (2023) is older than the master measured on 2026-10-06: it
has no Emscripten target and no `__EMSCRIPTEN__`; `__linux__` gates only the
OS name string, `/proc/self/exe` and `setpriority`.

Data in the release zip, `Xonotic/data/`: `xonotic-20230620-data.pk3`
317,540,306 B (configs, `progs.dat`, models, textures),
`xonotic-20230620-maps.pk3` 626,168,138 B, `-music.pk3` 110,697,275 B,
`-nexcompat.pk3` 125,433,473 B, `-xoncompat.pk3` 2,308,299 B,
`font-unifont-20230620.pk3` 2,839,911 B, `font-xolonium-20230620.pk3`
171,388 B; SHA-256 of each in `build/xonotic-evidence/` (`pk3.sha256`).
Staging decision: 0 A.D. serves each data file as its own `SOURCE` (its mod
zips split into `public-NNN.zip` parts), the local models as one package image
per GGUF shard. Every Xonotic pk3 is below 2 GiB, so each pk3 becomes one
`SOURCE` of a `xonotic-data` package (943 MB for a bot match: data and maps;
music and the Nexuiz compatibility packs can stay out of the first image). No
splitting is needed; the packaging layer already cuts large static files into
20 MiB parts. Not staged yet: the browser test fetches two pk3s through its
fixture server instead, which the README says is the test's arrangement.

## Measured native (2026-10-07, host gcc 11, SDL2 2.0.20, 16 cores)

Build: `make -j16 sv-release sdl-release` with `DP_LINK_JPEG=dlopen
DP_LINK_ZLIB=shared`: 9.2 s wall, 91.5 s user; `darkplaces-dedicated`
3,687,016 B, `darkplaces-sdl` 4,088,296 B (`build/xonotic-evidence/native-build.log`).

Dedicated server, upstream's own `serverbench.cfg` (bots only, skill 100,
`timelimit_override 3`, `sys_usenoclockbutbenchmark 1`, quits at the end):
`+exec serverbench.cfg +bot_number 8 +maxplayers 16` on stormkeep ran the
whole match (eventlog `:gamestart` to `:end`, 196 s of game time at
`sys_ticrate 0.0333333`, about 5,900 server frames) in 4.65 s wall, 4.38 s
user: about 1,270 server frames per second, 489 MB maximum RSS. With the
config's 32 bots: 13.2 s wall, 12.86 s user, 532 MB RSS. Logs:
`native-serverbench-8bots.log`, `-32bots.log`. A plain `+map dance` did not
spawn a server (dance is CTF-only; the fallback printed and nothing followed),
so the test uses `serverbench.cfg`.

QuakeC, natively: gmqcc built with `make CXX=g++` (9.1 s user, 465,816 B).
`qcsrc/Makefile` plus `tools/qcc.sh` reduce to three steps per program, which
`demos/xonotic/Makefile`'s `qc` target repeats: `cc -xc -E` over
`server|client|menu/progs.inc` (the server's output is 135,089 lines,
10.5 MB), the `# N "file"` markers rewritten to `#pragma file`/`#pragma line`
(gmqcc only accepts them when a blank line precedes each pair, as upstream's
sed produces), then gmqcc `-std=gmqcc -Ooverlap-locals -O3 …` with
`-DWATERMARK="xonotic-v0.8.6"` (upstream's `git describe --tags`). gmqcc
takes 1.52 s and 439 MB for the server, 0.68 s / 246 MB for the client,
0.25 s / 110 MB for the menu. The three outputs are byte-identical to the
release's `progs.dat` (6,663,681 B, SHA-256 `e6f5c70b…`), `csprogs.dat`
(4,021,257 B, `7d780716…`) and `menu.dat` (1,756,668 B, `dc750760…`) in
`xonotic-20230620-data.pk3` (`build/xonotic-evidence/released-dat.sha256`),
so the in-Dolly build can be checked by hash.

Client, under a private `Xvfb :141` with Mesa llvmpipe (GL 4.5 compatibility,
GLSL 450): the SDL client starts, loads stormkeep and runs a bot match
(`native-client-probe.log`). JPEG textures do not decode on this host (the
engine dlopens `libjpeg.so.62`; the host has only libjpeg 8), so texture-driven
permutation bits (gloss, normal maps from `.jpg`) are undercounted here; PNG,
FreeType and Vorbis load. The release's seven presets (`effects-*.cfg` in
`data.pk3`, saved in `.cache/xonotic/presets/`) never set `r_viewfbo`,
`r_shadow_deferred`, `vid_samples` or `r_hdr`, so by the engine's code
(`gl_rmain.c` 6213–6378, `r_shadow.c` 2196–2204, 6067–6079):

| Preset | Beyond `low` | Render targets and GL features |
|---|---|---|
| omg, low | none | swapchain RGBA8 + depth24; DXT textures (`gl_texturecompression_2d 1`); no lightmaps (omg) |
| med | `r_shadow_realtime_dlight 1` | as low; dynamic lights are extra shader permutations, no new targets |
| normal | `r_glsl_deluxemapping 1`, `r_shadow_gloss 1`, `r_shadow_usenormalmap 1`, `r_depthfirst 1` | as low; depth-first pass draws the scene twice |
| high | `r_bloom 1`, `r_motionblur 0.4`, `r_water 1` (0.25 res), `r_coronas_occlusionquery 1`, `r_depthfirst 2` | screen copied into RGBA8 textures (`R_Mesh_CopyToTexture`: bloom chain, motion-blur ghost, water refraction); water reflection rendered to an RGBA8+depth FBO (`r_water_fbo`); `GL_ARB_occlusion_query` samples-passed queries for coronas, with the engine's own fallback when unsupported |
| ultra | `r_shadow_shadowmapping 1` with `r_shadow_realtime_world 1`, `r_shadow_realtime_dlight_shadows 1`, `r_glsl_offsetmapping 1`, water at 0.5 res | plus a depth-only FBO with a 24-bit compare-sampled shadow-map texture (`TEXTYPE_SHADOWMAP24_COMP`), no stencil (shadow maps replace stencil volumes) |
| ultimate | `r_shadow_realtime_world_shadows 1`, relief mapping, water at full res, model decals | as ultra, more shadow-map renders per frame |

So no preset needs more than one colour attachment, a float colour target or
stencil; those appear only with `r_viewfbo 2/3` (`TEXTYPE_COLORBUFFER16F/32F`,
`DEPTHBUFFER24STENCIL8`) and `r_shadow_deferred`, which the presets leave off.
What `gpu@0` lacks for `high` and above is occlusion queries (fallback exists)
and a way to copy the presented frame into a texture; `ultra` adds depth-only
render targets with compare sampling.

`timedemo` per preset, native llvmpipe at 1024×768 on 16 cores
(`build/xonotic-evidence/native-presets.sh`; `bench.dem` is a 4.1 MB recording
of a 45 s bot match on stormkeep, 2,440 frames; logs `native-timedemo-*.log`,
`developer 1` prints each `Compiling shader mode M permutation P`):

| Preset | fps | Shader mode:permutation pairs compiled |
|---|---|---|
| omg | 416.2 | 3: generic 0:12 0:13, postprocess 1:16384 |
| low | 75.1 | 10: generic 0:12 0:13; vertexcolor 4:0 4:2048 4:4194304; lightdirection 11:1 11:2048 11:2049 11:8390657 11:8390665 |
| med | 63.0 | the same 10 |
| normal | 75.4 | 11: as low plus depth/shadow 2:0, lightdirection with specular and normal maps (11:8193 11:10241 11:8398849 11:8398857) |
| high | 56.6 | 14: plus postprocess bloom 1:4096 1:20480 and generic 0:8388621 (reflectcube) |
| ultra | 19.6 | 14: plus offsetmapping bits (4:65536 4:67584 4:4259840, 11:75777) |
| ultimate | 8.4 | 14: plus reliefmapping bits (4:196608 4:198656 4:4390912, 11:206849) |

Modes by number (`dpsoftrast.h`): 0 generic, 1 postprocess, 2 depth/shadow,
4 vertexcolor, 11 lightdirection; the demo never compiled 12 lightsource
(realtime dynamic lights), 13 refraction or 14 water, so the counts above
miss the dlight and water permutations a map with water and rockets would
add; JPEG textures (the host's libjpeg is 8, the engine wants 62) also
decoded as missing, so texture-driven bits are undercounted. The totals are
small: 17 modes × 20 permutation bits in the source, 14 pairs in use at
`ultra` on this demo.

## Dolly build findings (2026-10-07, `xonotic-build` on `system-tools`)

- All 90 `OBJ_SV` units and gmqcc's 14 C++ units compile with Dolly's `cc`
  and `c++` at `-O1` unchanged, with the four-hunk patch
  (`demos/xonotic/darkplaces-dolly.patch`): dedicated server listens on the
  loopback address type (upstream opens it only for listen servers), no
  `SUPPORTDLL` (no `dlopen`; `Sys_LoadLibrary` reports every library
  unavailable), `Sys_Sleep` falls back to `usleep` instead of `select`, and
  `Sys_ConsoleInput` polls stdin with `poll`. `__linux__` is never defined and
  never needed.
- Dolly's `cc` rejects `-fno-math-errno` and `-fno-trapping-math`
  (upstream's `OPTIM_RELEASE`) and `-fno-exceptions`/`-fno-rtti` are not in
  its list either; the Makefile passes none of them.
- Dolly's libc (`libdolly-process.a`, `runtime-adapter.c`) already defines
  `socket`, `bind`, `sendto`, `recvfrom`, `setsockopt`, `getsockname`,
  `getaddrinfo`, `freeaddrinfo` and `gethostbyname` as failing calls, so
  `lhnet.c` links unchanged; the INET ports fail at run time and only the
  loopback socket carries packets. A first `sockets.c` with the same stubs was
  a duplicate-symbol error and was removed.
- The server's static data needs 37,888,768 bytes of initial memory (the
  driver's default is 16 MiB): the link passes `-Wl,--initial-memory=67108864`,
  as the LLVM-in-Dolly build does with 32 MiB.
- The first run in Dolly reached the game start and then died on the session
  lock: `FS_SysOpenFiledesc` takes an `fcntl(F_SETLK)` write lock on
  `~/.xonotic/lock`, which fails without file locks (they are in
  `integrate/round3`). The fifth patch hunk keeps the lock file an ordinary
  file under `__dolly__`; the hunk can go when round 3 lands.
- `log_file` writes relative to the user directory (`~/.xonotic/data/`), not
  the base directory; the test reads it there.

## Measured in Dolly (2026-10-07, Chromium, `xonotic-build`)

- Image: 83.8 s (`npm run image -- xonotic-build`, one builder, 6 GB cap),
  of which the make of 90 engine units, 14 gmqcc units and the link; the
  snapshot is 183.4 MB against system-tools' 160.7 MB.
  `/usr/bin/xonotic-dedicated` 3,424,516 B (native 3,687,016 B), `gmqcc`
  653,188 B (native 465,816 B).
- The browser test (`demos/xonotic/test/xonotic-browser.mjs`) fetches
  `xonotic-20230620-data.pk3` and `-maps.pk3` (943 MB) with curl into
  `/home/dolly/xonotic/data`, then runs `serverbench.cfg` with 8 bots on
  stormkeep, `timelimit_override 1`: the match ran to its end
  (`:gamestart`, `:scores:dm_stormkeep:196`, `:end`, `quit_and_redirect`
  quits, status 0) in 62.0 s from start to exit; page memory peak 2,200 MiB
  (Chrome's `measureUserAgentSpecificMemory`, which counts the 943 MB of
  pk3 bytes in the shared filesystem). The engine's own log ran from
  22:59:42 to 22:59:55 (13 s) for the 1-minute match in an earlier run, so
  the server simulates about 4.6x faster than real time with 8 bots against
  native's 13x (4.65 s for 3 minutes); the rest of the 62 s is loading the
  two pk3 archives and the map.
- QuakeC in Dolly: `make -f /usr/src/dolly/xonotic/Makefile qc` (cc -E,
  awk, gmqcc) builds `progs.dat` 6,663,682 B, `csprogs.dat` 4,021,229 B
  and `menu.dat` 1,756,664 B in 23.8 s. They are not byte-identical to the
  release's (6,663,681 / 4,021,257 / 1,756,668): the header, statement
  count, definitions, fields and function table are equal, and all
  differences trace to `__LINE__`-derived strings (`./common/stats.qh:392`
  vs `:395`, `736` vs `737`: 2,491 strings), whose changed lengths shift
  string offsets through globals and statements. The line numbers differ
  because Dolly's clang `-E` places `# N "file"` markers where the
  release's gcc emitted blank lines, and gmqcc counts the inserted
  `#pragma` lines; the native gcc pipeline reproduces the release exactly.
  The Dolly-built `progs.dat`, downloaded and run by the native server as
  a loose file, plays a full match (`native-loose-dolly.log`), so the
  compiler output is sound.
- The same loose `progs.dat` under the Dolly engine first failed with
  "No classname for" every entity and "QC function StartFrame is missing":
  a truncated load. Probed in `xonotic-build` (`build/xonotic-evidence/readprobe.log`):
  one `read()` of 16 MiB on the 3,424,516-byte `xonotic-dedicated` returns
  1,048,576; a loop reads it whole, and `cp` copies it whole. Linux never
  short-reads regular files and `FS_Read` does a single `read()` for large
  plain files (pk3 members inflate in chunks, so the first match passed).
  The sixth patch hunk loops the read under `__dolly__`; the platform fix is
  branch `core/full-read` (`f196abfe`, task `20261007-083500-full-read`), and
  the hunk goes when it lands.
- With that hunk, the whole test passes in both browsers (`build/xonotic-evidence/browser-test-chromium-9.log`,
  `browser-test-firefox-1.log`): Chromium 112.8 s in all (match 62.3 s,
  page peak 2,201 MiB; gmqcc's three programs 31.4 s; the second match on the
  Dolly-built `progs.dat` to its end), Firefox 83.4 s (match 20.1 s, no
  memory measurement in Firefox; gmqcc 38.9 s). The final runs with the
  commented hunk (`browser-test-chromium-10.log`, `browser-test-firefox-2.log`):
  Chromium 101.6 s (match 62.0 s), Firefox 49.1 s (match 10.0 s). The
  Chromium match number includes the test's `measureUserAgentSpecificMemory`
  call every 2 s, which forces garbage collection; the engine's own log of an
  uninstrumented Chromium run spanned 13 s, so the server simulates the
  1-minute match in 10 to 13 s in either browser against native's 1.6 s:
  six to eight times slower, 190 to 250 server frames per second with 8 bots.

## Client plan (2026-10-07, route (a), `normal` preset, no contract change)

- Where the render path attaches. DarkPlaces already runs two backends
  behind the same call sites: OpenGL through `qgl*`, and its own software
  rasterizer `dpsoftrast.c` behind `RENDERPATH_SOFT`, 113 switch sites in
  seven files (`gl_backend.c` 55, `gl_rmain.c` 28, `gl_textures.c` 14,
  `r_shadow.c` 10, `gl_draw.c` 4, `vid_shared.c` 1, `vid_sdl.c` 1). The
  DPSOFTRAST surface is 41 functions: init and shutdown, six texture calls,
  eighteen render-state calls (targets, viewport, clears, masks, depth,
  blend, cull, scissor, polygon offset), four vertex-pointer calls,
  `SetShader(mode, permutation)` with four uniform setters,
  `DrawTriangles`, `CopyRectangleToTexture` and `GetPixelsBGRA`: exactly the
  state a WebGPU pipeline needs, with the mode and permutation naming the
  pipeline. So the Dolly path is `RENDERPATH_DOLLY` sharing every
  `RENDERPATH_SOFT` site, and `dpgpurast.c` implementing those 41 calls over
  `libdolly-gpu` (`host/gpu/gpu.h`: buffers, WGSL shaders, pipelines, bind
  groups, draws, copies, submit; textures through `FEATURE_TEXTURE_RENDER`
  and `FEATURE_TEXTURE_BC`). The 112 `qgl*` functions are never mapped one
  by one. `slopyard` and `gpu-fluid` show a program opening the device and
  submitting batches; 0 A.D. shows an engine backend over it.
- Shaders. `shader_glsl.h` is one source compiled per mode and permutation
  (33 permutation bits). The `normal` preset's bot match compiles 11 pairs
  (modes generic, depth/shadow, vertexcolor, lightdirection; measured
  above), so the preparation step generates those GLSL variants with the
  engine's own `#define` prelude, runs glslang then naga as
  `demos/zero-ad/toolchain/prepare-shaders.sh` does, and ships the WGSL
  beside the source; a pair the game asks for at run time that is missing
  draws nothing and logs it. Host-side translation is a bootstrap exception.
- Window and input. The `sdl2` package: `vid_sdl.c` unchanged over its
  Dolly video backend (framebuffer presentation, relative mouse, warp),
  `sys_sdl.c` for the loop and clock; `thread_null.c`, `snd_null.c` and
  `cd_null.c` until the SDL2 audio backend over `audio@0` exists.
- Milestones, in order: (1) the SDL client built in Dolly and a first frame
  on the page through the engine's software rasterizer (`vid_soft 1`, which
  the 0.8.6 engine still carries) with a non-blank-frame test; (2) the data
  pk3s as `SOURCE`s and an `xonotic` image whose ENTRY starts the client;
  (3) `RENDERPATH_DOLLY` for the 2D path (`gl_draw.c`: textured quads, the
  generic mode's two permutations) so the menu draws on the GPU; (4) the
  `normal` preset's 11 pairs in WGSL, a map, a frame of a bot match. Not
  started after that: sound, licence rows, `high` and above (owner's
  decision on a frame-to-texture copy and occlusion queries).

## Client findings (2026-10-07, milestone 1)

- The SDL client links in Dolly (`xonotic-sdl`, built beside the server:
  96 s for the image with both; all common units compiled a second time with
  `-DCONFIG_MENU -DCONFIG_CD`). It starts in the browser, loads the pk3s,
  opens the display through the sdl2 package, then fails at the video mode:
  "No dynamic OpenGL support in current SDL video driver (dolly)" for every
  fallback, "Quake Error: Video modes failed", status 1, display released,
  shell back (`browser-test-chromium-12.log`).
- The software rasterizer is not a way out: `vid_soft` is registered only
  under `SSE_POSSIBLE` with SSE2 detected (`vid_shared.c` 1636), and
  `dpsoftrast.c`'s span and triangle code lives in `#ifdef SSE_POSSIBLE`
  regions with no scalar twin (lines 1470–1662, 4850–5316). On wasm64 it
  compiles to a rasterizer that draws nothing. Emscripten's sysroot carries
  `compat/emmintrin.h`, SSE2 over Wasm SIMD, which would run upstream's
  rasterizer unchanged, but Dolly's `cc` (`src/compiler.cpp`) accepts a
  fixed option list without `-msimd128` or `-msse2`. Integrator's decision
  (08:55): take the software frame through Wasm SIMD the way Slopyard
  compiles Box3D: `demos/xonotic/simd-unit.c` wraps the two SSE2 units in a
  per-function `target("simd128")` pragma with `-D__SSE__ -D__SSE2__`, and
  the client gets `-DSSE_PRESENT -DSSE2_PRESENT` so `quakedef.h` takes the
  x86 SSE2 paths and `vid_soft` is registered; the software path is the
  interim renderer and route (a) stays the goal. Separately `core/cc-simd`
  (`69552b32`, from `integrate/round3`) lets `cc` accept `-msimd128`.
- Route (a)'s real shape: `gpu@0` owns the display while a surface is open
  (`dolly_gpu_open`), and the sdl2 package's video backend owns it for an
  SDL window, so the GPU path cannot sit behind `vid_sdl.c`. It needs a
  `vid_dolly.c` beside `vid_sdl.c` (display lease, input records as
  `demos/classicube/window.c` and `input.c` read them, relative mouse) and
  `dpgpurast.c` behind the `RENDERPATH_SOFT` sites, with `sys_linux.c` for
  the loop. `gpu@0` has what the 2D path and `normal` need: `CREATE_TEXTURE`,
  `WRITE_TEXTURE`, `CREATE_SAMPLER`, `GRAPHICS_PIPELINE`, `RESOURCE_GROUP`,
  `DRAW_MESH` (`host/gpu/gpu-abi.h`), `FEATURE_TEXTURE_RENDER` and
  `FEATURE_TEXTURE_BC`. Not started: the software path below is the interim
  renderer.
- First frame (09:00, commit `53c3ca34`): with the SIMD wrapper the client
  registers `vid_soft`, opens its 1024×768 window through the sdl2 package
  and draws the menu; the test's capture of `#display` at 1024×768 has 55%
  of its pixels lit (neither blank nor flat), `+defer 40 quit` returns to
  the shell with the display released. Chromium passed the whole test
  (match, QuakeC rebuild, rematch, frame) in 144.9 s
  (`browser-test-chromium-13.log`). The image with the client builds in
  98.7 s.
- Frame rate: `short.dem` is a 22 s bot-match recording on stormkeep
  (1,046 frames, recorded natively at 1024×768, kept in
  `.cache/xonotic/release/Xonotic/data/`). Native llvmpipe (GL path,
  `-benchmark short`): 13.81 s, 75.8 fps (`native-benchmark-short.log`).
  Dolly's software path, same demo and size, one rasterizer thread
  (`-benchmark short` in the test): Chromium 34.98 s, 29.9 fps; Firefox
  24.44 s, 42.8 fps (`browser-test-chromium-14.log`,
  `browser-test-firefox-3.log`; the whole test 183.6 s and 141.3 s). So the
  interim software renderer plays at 30–43 fps at 1024×768 in the browser
  against 76 fps for llvmpipe's GL on the host; both are software numbers.
- Data image (09:01): `xonotic` (system, the client, data, maps and fonts,
  946 MB of pk3) builds in the 9 GB slot in 107.5 s; under the 6 GB cap
  Chrome was OOM-killed twice during the snapshot upload at 5.2 GB anon RSS
  (`image-build-10.log`, `-11.log`), and `/usr/bin/time -v` on the 9 GB
  build reports a 3.0 GB maximum RSS for its largest process
  (`image-build-13.log`), so the peak lies between 6 and 9 GB. `/xonotic/`
  then opens into the menu (`xonotic-menu.png`, 60% of pixels lit), once
  the wrapper stopped using `exec`, which Slop does not have.
- Libraries (09:15, commit `bb95315c`): the first menu drew with the bitmap
  console font and grey or checkerboard textures, because the engine
  dlopens libjpeg, libpng and FreeType and `Sys_LoadLibrary` reports them
  unavailable. Linked as upstream's Android build links them: IJG libjpeg 9f
  (pinned, built in the image, `LINK_TO_LIBJPEG`) and FreeType with its
  libpng copied from `zero-ad-deps` (`DP_FREETYPE_STATIC`; `zero-ad-deps`
  is a toolchain, so `COPY` rather than `INSTALL`). PNG textures have no
  static path in 0.8.6 (`image_png.c` binds through function pointers
  only), so they stay missing. With real textures the frame's lit fraction
  is 32% and the software timedemo falls to 13.7 fps in Chromium (76.6 s
  for 1,046 frames; `browser-test-chromium-15.log`, 231 s in all) and
  16.1 fps in Firefox (65.1 s; `browser-test-firefox-4.log`, 174.3 s in
  all): the earlier 30–43 fps drew flat untextured surfaces. The client's own log with
  `developer 1` (`client-log-run-2.log`) shows "Using DarkPlaces Software
  Rasterizer rendering path", "DPSOFTRAST available (SSE2 instructions
  detected)", the 1024×768 window, no image load errors and no library
  failures; the "Failed to load font-file for 'gfx/conchars'" lines before
  the font configuration loads appear natively too. The rebuilt data image
  was OOM-killed once more in the 9 GB slot (Chrome at 7.1 GB anon RSS,
  09:18:57) and again on a retry (7.2 GB, 09:21:23): the peak sits at the
  cap and variance decides. The integrator built it from `9f98e19e` in an
  18 GB scope (117 s, exit 0) and serves this tree at
  `http://127.0.0.1:9009/xonotic/`. Summary of the data image's builds:
  6 GB cap: killed twice (Chrome 5.2 GB anon RSS); 9 GB: passed once, killed
  twice (7.1 and 7.2 GB); 18 GB: passed. A 946 MB image needs 7 to 9 GB of
  renderer memory during the snapshot upload, about eight times its size;
  noted in `tasks/20261007-065624-publish-memory` (the builder-copies task
  is not in this tree).

- Live match in the client (09:40): started with `+map stormkeep
  +bot_number 4`, the client spawns the server and the bots connect
  (`SpawnServer: stormkeep` and the bots' `connected` lines in its log), and
  both browsers pass a stage that samples two differing lit frames and the
  quit (Chromium 297.9 s, Firefox 230.6 s in all; `browser-test-chromium-16.log`,
  `browser-test-firefox-5.log`), but those frames were the menu's: a
  stricter stage that samples after 40 s found the display static at 87.5%
  lit with one checksum from 50 s to the quit at 200 s
  (`live-timeline.log`). The client's developer log of a 100 s run
  (`live-client.log`, 2,927 lines) shows why: `SpawnServer`, the bots
  connecting, `Client local:2 connected`, `CL_SignonReply: 1` with the CSQC
  loaded, then the precache of models and sounds (434 "Sound … not found"
  lines, which the native client with real sound does not print; the null
  sound unit has no sounds) and `CL_SignonReply: 2` and `3` only at the
  end, right before the deferred quit: the software client in Dolly takes
  about 100 s from the map command to entering the game, most of it in the
  loading plaque, against a few seconds natively; where the time goes is
  not profiled. The engine also prints 204 `LHNET_OpenSocket_Connectionless`
  failures as `NetConn_UpdateSockets` keeps retrying the INET client ports.
  The test's live stage now starts sampling frames after 150 s, requires
  two differing lit frames below the plaque's 87% and `CL_SignonReply: 3`
  in the log, and quits at 240 s.

## Route (a): the map of what remains (2026-10-07 09:35, estimates)

What exists: the client over `vid_sdl.c` and the software rasterizer, the
data image, both browsers. The `gpu@0` path replaces the rasterizer and the
SDL window; each piece below runs on its own and the estimates are working
days for one person, measured against this morning's pace (a port step with
a rebuild-and-test loop of 4 minutes).

1. `vid_dolly.c` (1–2 days): display lease, window size, the loop and
   clock from `sys_linux.c`, input from the display records as
   `demos/classicube/window.c` and `input.c` read them (keys with text,
   relative mouse and capture, focus loss), `VID_Finish` presenting the
   `gpu@0` surface. Proof: the menu's cursor and keys work and the window
   survives a resize.
2. `dpgpurast.c`, the 2D subset (2–3 days): the 41-call DPSOFTRAST surface
   behind the `RENDERPATH_SOFT` sites, with textures (`CREATE_TEXTURE`,
   `WRITE_TEXTURE`, samplers), vertex and index buffers, the generic mode's
   two permutations as WGSL, blend and scissor state, `DrawTriangles`,
   present. Proof: the menu drawn by the GPU, the test's frame check.
3. Shaders for `normal` (2–3 days): a host preparation step that expands
   `shader_glsl.h` for the 11 mode:permutation pairs measured for `normal`
   (plus the lightsource and water pairs a full match adds: measure them
   with a longer demo first), glslang then naga to WGSL, served beside the
   source; uniform and texture binding layouts per mode; a missing pair
   draws nothing and logs. Bootstrap exception until the translators run in
   Dolly.
4. The 3D state (2–3 days): depth and cull state, `R_Mesh_*` vertex
   formats, lightmaps and deluxemaps as textures, `depth/shadow` passes for
   `r_depthfirst`, `CopyRectangleToTexture` for what `normal` needs (none
   for `normal`; `high` waits for the owner's decision), the frame test on a
   live match. Proof: a bot match at the `normal` preset on the GPU, the
   timedemo rate against the 13.7 fps software number.
5. Sound (1–2 days): an SDL2 audio backend over `audio@0` in `demos/sdl2`
   (`SDL_OpenAudioDevice`, the callback driven from the main loop since the
   package has no threads), then `snd_sdl.c` unchanged. Proof: the menu
   music and weapon sounds.
6. Finishing (1 day): the asset licence pass, `docs/licences.md`, the
   README's effects table, the music and compatibility archives in the
   image, forced-termination and quit tests, the owner's acceptance.

Order: 1, 2 (first GPU frame), 3 and 4 together (the world), 5, 6. The
software path stays selectable (`vid_soft 1`) as the fallback until 4 is
measured faster than it.

## Decisions for the owner

1. Rendering route. (a) A Dolly render path inside DarkPlaces: a `gpu@0`
   backend behind its GL call sites, and the shader permutations in use
   translated to WGSL before the build (glslang, then Naga, as
   `demos/zero-ad/toolchain/prepare-shaders.sh`). (b) A general OpenGL subset
   over `gpu@0` in userspace with a GLSL-to-WGSL compiler running in Wasm,
   which other GL ports could share. Recommended: (a), the surface is seven
   files; (b) is its own task once a second GL port wants it.
2. `gpu@0` additions. More than one colour attachment, a float target or
   stencil are contract changes, not part of a port. What each Xonotic
   preset needs, from the engine's code paths the preset cvars reach
   (measured 2026-10-07; the frame rates are the native llvmpipe software
   baseline at 1024×768, not a hardware figure):

   | Preset | llvmpipe fps | Colour attachments | Float targets | Stencil | 3D textures | Occlusion queries | Other |
   |---|---|---|---|---|---|---|---|
   | omg | 416 | 1 (swapchain) | none | none | none | none | no textures (`r_showsurfaces 3`) |
   | low | 75 | 1 | none | none | none | none | DXT textures (`FEATURE_TEXTURE_BC`) |
   | med | 63 | 1 | none | none | none | none | dynamic lights: more permutations |
   | normal | 75 | 1 | none | none | none | none | deluxemapping, gloss, normal maps: more permutations; scene drawn twice (`r_depthfirst 1`) |
   | high | 57 | 1, plus RGBA8 render targets for bloom and water reflection | none | none | none | wanted (`r_coronas_occlusionquery 1`; engine falls back without) | copy of the presented frame into textures (bloom, motion blur, water refraction) |
   | ultra | 20 | as high | none | none | none | wanted, fallback | plus depth-only render targets with a 24-bit compare-sampled shadow map |
   | ultimate | 8 | as high | none | none | none | wanted, fallback | as ultra, more shadow-map passes; relief mapping |

   No preset sets `r_viewfbo` (16/32-bit float colour), `r_shadow_deferred`
   (four colour attachments), `vid_samples` (multisampling) or stencil shadow
   volumes (`r_shadow_shadowmapping 1` throughout), and the engine uses no 3D
   textures on these paths. So `gpu@0` as it is supports `normal`; `high`
   needs a frame-to-texture copy (render-to-texture of the scene, which the
   contract may already allow if the scene renders into an RGBA8 texture
   instead of the swapchain) and gains from occlusion queries; `ultra` and
   `ultimate` need depth-only render targets with compare sampling. Owner
   decides which of those three, if any, enter the contract; the port ships
   the best preset the agreed contract supports (`normal` today). Caveat: the
   permutation census ran one 45 s demo on stormkeep without water or
   dynamic lights and without JPEG textures, so it undercounts what `high`
   and above compile, not what they require.
3. Sound. DarkPlaces mixes in Wasm and outputs through SDL audio, which the
   `sdl2` package lacks, as it lacks thread creation for SDL's audio callback.
   Either an SDL2 audio backend over `audio@0` in `demos/sdl2`, which serves
   every SDL port, or a `snd_dolly.c` beside `snd_sdl.c`. Recommended: the
   SDL2 backend, since the gap is the package's.

## Work

In order; each step leaves something that runs. Steps 1 to 4 were done on
2026-10-07 morning (branch `demo/xonotic`; sections above record them); the
data is pinned but not yet staged as image sources.

1. Pin Xonotic's current release and the engine commit it ships. Stage the
   data as `SOURCE` chunks like 0 A.D.'s and record the sizes. Done, except
   the staging, whose shape is decided above.
2. Native baseline on the host, for measurement only and never a build input:
   for each Xonotic preset, log the shader mode and permutation pairs,
   framebuffer formats and GL features a bot match uses, and its `timedemo`
   frame rate. Done on llvmpipe.
3. Headless in Dolly: build the dedicated-server configuration (`*_null.c`)
   with `cc` and Make and run a bot match to its end. This proves the
   filesystem, pk3 loading and the QuakeC VM before any graphics. Done:
   `xonotic-build` and `demos/xonotic/test/xonotic-browser.mjs`, Chromium
   and Firefox.
4. QuakeC: the game logic is compiled to `.dat` files. Build it inside Dolly
   with Xonotic's compiler (gmqcc, unverified), or record the prebuilt files
   as a bootstrap exception in the demo README. Done: gmqcc builds in Dolly
   and the test plays its second match on the `progs.dat` built there.
5. Client: rendering by decision 1, SDL2 input with relative mouse and capture
   as `bhop` has, sound by decision 3. Started 2026-10-07: the SDL client
   builds in Dolly and draws through the engine's software rasterizer
   (interim; "Client findings" above); the `gpu@0` path (`vid_dolly.c`,
   `dpgpurast.c`, the `normal` preset's shaders in WGSL) and sound are not
   started.
6. `demos/xonotic/`: recipes, sources, `prepare-sources.sh`, tests, README and
   the licence rows. Done for what exists: `xonotic-build`, `xonotic`, the
   browser test, README, `config/upstreams.json` rows and a `docs/licences.md`
   section; the asset pass is not done.

Not in scope: network multiplayer (raw sockets are unsupported; 0 A.D.'s relay
over the broker is the precedent) and an agent player.

## Done when

- `npm run image -- xonotic` builds the engine and its libraries inside Dolly
  from pinned sources; anything built outside is a listed bootstrap exception.
- `/xonotic/` opens the menu, and a bot match on a stock map plays with
  keyboard, captured mouse and sound on a hardware adapter in Chrome and
  Firefox. A browser test starts a match, checks that a captured frame is not
  blank, and checks that quitting and forced termination both return to Slop
  with the kernel intact.
- This task records `timedemo` frame rates in Dolly and native, on the same
  machine and settings.
- The README lists the effects that are off and the `gpu@0` limit each waits
  for.
- `docs/licences.md` and `config/upstreams.json` cover the engine, the data
  and Dolly's GPL files, with the asset pass recorded.
- No browser authority is added beyond `gpu@0` changes the owner agreed to;
  `docs/browser-boundary.md` follows any such change.
