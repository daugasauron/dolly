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

## Decisions for the owner

1. Rendering route. (a) A Dolly render path inside DarkPlaces: a `gpu@0`
   backend behind its GL call sites, and the shader permutations in use
   translated to WGSL before the build (glslang, then Naga, as
   `demos/zero-ad/toolchain/prepare-shaders.sh`). (b) A general OpenGL subset
   over `gpu@0` in userspace with a GLSL-to-WGSL compiler running in Wasm,
   which other GL ports could share. Recommended: (a), the surface is seven
   files; (b) is its own task once a second GL port wants it.
2. `gpu@0` additions. More than one colour attachment, a float target or
   stencil are contract changes, not part of a port. Step 2 below measures
   what each preset needs; the port ships the best preset the agreed contract
   supports.
3. Sound. DarkPlaces mixes in Wasm and outputs through SDL audio, which the
   `sdl2` package lacks, as it lacks thread creation for SDL's audio callback.
   Either an SDL2 audio backend over `audio@0` in `demos/sdl2`, which serves
   every SDL port, or a `snd_dolly.c` beside `snd_sdl.c`. Recommended: the
   SDL2 backend, since the gap is the package's.

## Work

In order; each step leaves something that runs.

1. Pin Xonotic's current release and the engine commit it ships. Stage the
   data as `SOURCE` chunks like 0 A.D.'s and record the sizes.
2. Native baseline on the host, for measurement only and never a build input:
   for each Xonotic preset, log the shader mode and permutation pairs,
   framebuffer formats and GL features a bot match uses, and its `timedemo`
   frame rate.
3. Headless in Dolly: build the dedicated-server configuration (`*_null.c`)
   with `cc` and Make and run a bot match to its end. This proves the
   filesystem, pk3 loading and the QuakeC VM before any graphics.
4. QuakeC: the game logic is compiled to `.dat` files. Build it inside Dolly
   with Xonotic's compiler (gmqcc, unverified), or record the prebuilt files
   as a bootstrap exception in the demo README.
5. Client: rendering by decision 1, SDL2 input with relative mouse and capture
   as `bhop` has, sound by decision 3.
6. `demos/xonotic/`: recipes, sources, `prepare-sources.sh`, tests, README and
   the licence rows.

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
