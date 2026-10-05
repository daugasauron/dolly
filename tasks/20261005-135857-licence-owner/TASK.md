# Licence decisions for the owner: 0 A.D. source, GPL-marked agents, ClassiCube textures

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: licences,owner

The licence audit (`docs/licences.md`, task `20261005-131648-licences`) left
three points that need the owner's decision. Everything mechanical is fixed.

1. **0 A.D. source still partly unserved (GPL-2.0-or-later engine, MPL-2.0
   SpiderMonkey).** Since round 2 the engine is built in Dolly
   (`zero-ad-deps`, `zero-ad-engine`), so the site serves most of its
   corresponding source by construction as pinned recipe inputs:
   `zero-ad-build/engine.tar.gz` (engine source, `engine.patch`, premake and
   its patch), `zero-ad-build/deps.tar.gz` (libpng, FreeType, Ogg, Vorbis,
   {fmt}, libxml2, ICU, libsodium, ENet, Boost, pkgconf and Dolly's patches),
   `openal/source.tar`, the SDL2 package's source, and the recipes as build
   scripts. What it still does not serve:
   - SpiderMonkey 128.13: `zero-ad-build/mozjs-host.tar.gz` carries only its
     headers and the prebuilt `libjs_static.a` and `libjsrust.a`. Missing are
     `mozjs-128.13.0.tar.xz` (150 MB, inside the pinned
     `0ad-0.28.0-unix-build.tar.xz`, which `prepare-build-sources.sh` excludes),
     including the Rust crates `libjsrust.a` links, and Dolly's
     `toolchain/spidermonkey.patch` and cross-build scripts
     (`build-spidermonkey.sh`, `spidermonkey.sh`, `link.sh`, `wasm64.cmake`,
     `rust-bootstrap.toml`).
   - The game data's GPL shaders: the served mod archives hold WGSL that Naga
     translated, not the original GLSL from `0ad-0.28.0-unix-data.tar.xz`, nor
     `toolchain/convert-shaders.py` and `package-graphics.py` that made them.
   Both fit the existing mechanism, no separate download: stage
   `zero-ad-build/mozjs-source.tar.xz` (the pinned tarball, copied as is) plus a
   tar of the SpiderMonkey patch and scripts, and a `zero-ad-build/shaders.tar.gz`
   of the original shaders and the two scripts, then add each as a `SOURCE`
   (to `/tmp`, not retained) of `Dollyfile-zero-ad-engine` and
   `Dollyfile-zero-ad`. The build only verifies their digests. Cost: about
   150 MB and eight 20 MiB Cloudflare parts on daugasauron.com; GitHub Pages
   does not ship zero-ad. The alternative, GPLv3 §6(d) directions to Wildfire
   Games' copy, leaves availability to a third party.
2. **GPL-marked Dolly files.** 33 files carry
   `SPDX-License-Identifier: GPL-2.0-or-later`. Only the Seven Kingdoms arena
   code compiled into 7kaa (`demos/rts/arena.cpp`, `input.cpp`, `OAUDIO.h`, …)
   and `demos/zero-ad/toolchain/engine.patch` must stay GPL; the agents,
   spectator and viewers are Dolly's own separate programs and could be MIT.
3. **ClassiCube's default texture pack** (`misc/cc_textures.zip`) states no
   licence; it ships under ClassiCube's BSD-3-Clause `license.txt`, which names
   no assets. Accept that reading, or drop the pack.

## Done when

Each point is decided and either applied or recorded here as accepted.

## Decisions (2026-10-06)

The owner delegated the three points: "research them thoroughly and go with the
answer that aligns with the goal of the project."

1. **0 A.D.: serve the missing corresponding source.** The project builds from
   pinned, published upstream source and records bootstrap exceptions, so GPL,
   LGPL and MPL binaries ship with their source.
   - `zero-ad-engine` takes `zero-ad-build/bootstrap.tar` (151 MB) as a
     `SOURCE` it only verifies: `libraries/source/spidermonkey` of the pinned
     `0ad-0.28.0-unix-build.tar.xz` (SpiderMonkey 128.13's tarball, 0 A.D.'s
     patches, `build.sh`, `mozconfig`) and `demos/zero-ad/toolchain` (the
     SpiderMonkey cross-build, `spidermonkey.patch`, and the shader conversion
     `convert-shaders.py` and `package-graphics.py`). The GLSL shader sources
     already ship in the served mod archives; only Naga's WGSL replaces the
     SPIR-V. A `SOURCE` of the build-only `zero-ad-engine` is enough: the domain
     catalog's closure publishes every input of every image it includes.
   - Hosting: Cloudflare splits the tar into eight 20 MiB parts and adds one
     `_headers` rule per release (23 of 100 per release, so still at most three
     predecessors); GitHub Pages does not ship zero-ad.
   - `deps.tar.gz` maps each linked library's licence to
     `/usr/share/licenses/{enet,fmt,freetype,icu,libogg,libpng,libsodium,libvorbis,libxml2,pkgconf}`,
     `mozjs-host.tar.gz` SpiderMonkey's `LICENSE` and MPL-2.0 text and the
     licence files of the 51 vendored crates compiled into `libjsrust.a`
     (`/usr/share/licenses/spidermonkey/crates/`); `zero-ad-deps` (with SDL2's
     from the SDL2 package) and `zero-ad-engine` retain them and `zero-ad`
     copies the twelve directories of linked libraries.
   - FreeType is used under its GPL-2.0-or-later option (its `LICENSE.TXT`:
     the FTL is incompatible with GPLv2).
2. **GPL-marked files: GPL only where compiled into a GPL program.** All 33
   files were added in this repository (first in `4b441962`, `f79bfa7f`,
   `95f330be`, `bb248f7b`); none copies Seven Kingdoms or 0 A.D. code (no
   upstream identifiers or includes).
   - Stay GPL-2.0-or-later (8): `demos/rts/{Makefile,OAUDIO.h,arena.cpp,arena.h,config.h,input.cpp,input.h}`,
     compiled and linked into the `seven-kingdoms` binary with
     `-include config.h` (`OAUDIO.h` implements 7kaa's `AudioBase`), and
     `demos/zero-ad/engine.patch`, a patch to 0 A.D.'s GPL engine.
   - Now MIT (25): `demos/rts/{codec.mjs,player.js}`, `demos/rts/spectator/*`,
     `demos/game-agent/{mission.mjs,settings.mjs,viewer.cpp}`,
     `demos/classicube/agent/{main.mjs,mission.mjs,player.js,settings.mjs,viewer.cpp,world.mjs}`
     and `demos/bhop/agent/{codec.mjs,main.mjs,player.js,replay.mjs}`. They are
     Pi extensions and Janis programs, and SDL/stb_truetype viewers, that drive
     the games from outside over pipes, input packets and screenshots; ClassiCube
     is BSD-3-Clause and Airtime is Dolly's own. The GPL `COPYING` copies in
     `demos/game-agent` and `demos/classicube/agent`, and the recipe lines that
     kept them, are removed. The README names the 8 GPL files.
3. **ClassiCube's default textures: replaced.** The pack is upstream's
   `misc/cc_textures.zip` at the pinned commit. `license.txt` (BSD-3-Clause,
   UnknownShadow200) names no assets; `credits.txt` says Goodlyay "designed all
   the textures in the web client"; asked for the pack's licence in
   ClassiCube issue 1430 (2025-09-07), Goodlyay granted "explicit permission
   ... to be used in ReMinecraftPE" only. No licence names the pack, so Dolly
   does not redistribute it. `demos/classicube/textures.mjs` writes Dolly's own
   MIT `default.zip` (procedural `terrain.png` with 4,155 colours and a plain
   `gui.png` hotbar), deterministic, staged in `classicube/source.tar.gz`.

## Verification (2026-10-06)

- `DOLLY_IMAGE_JOBS=1 DOLLY_BUILD_IMAGES=zero-ad work/build-slot.sh npm run
  image`: zero-ad-deps, zero-ad-engine (verifies `bootstrap.tar`, retains none
  of it) and zero-ad rebuilt in 1,073 s. The `zero-ad` manifest lists
  `/usr/share/licenses/{OpenAL,SDL2,enet,fmt,freetype,icu,libogg,libpng,libsodium,libvorbis,libxml2,spidermonkey}`
  with 51 crate directories under `spidermonkey/crates`.
- 0 A.D. browser tests on the rebuilt images: `0ad-engine-browser.mjs`
  (simulation, replay, control, save/load, pipes), `0ad-spidermonkey`,
  `0ad-openal` and `0ad-enet` passed; `0ad-graphics-browser.mjs zero-ad
  software` passed on Xvfb `:132` (SwiftShader). Its default hardware mode got
  no GPU on Xvfb.
- `DOLLY_BUILD_IMAGES=classicube`: classicube-build and classicube rebuilt;
  `node demos/classicube/test/classicube-browser.mjs` passed in 332 s with
  Dolly's textures, including its check for more than 256 distinct colours on
  screen. The image holds no GPL `COPYING` for the agents.
- `npm run -s test:source`: 358 of 358 pass, including the licence artifact
  test and `test/upstreams.test.mjs`.
- Not rebuilt here: `bhop` and `rts-arena` (agent headers and the removed
  `COPYING`; no code change). The catalog rebuild covers them.

Closed with the commits on `work/licences-3`.
