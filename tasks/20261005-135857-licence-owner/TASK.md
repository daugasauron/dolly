# Licence decisions for the owner: 0 A.D. source, GPL-marked agents, ClassiCube textures

- STATUS: OPEN
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
