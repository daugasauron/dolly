# Licence decisions for the owner: 0 A.D. source, GPL-marked agents, ClassiCube textures

- STATUS: OPEN
- PRIORITY: 250
- TAGS: licences,owner

The licence audit (`docs/licences.md`, task `20261005-131648-licences`) left
three points that need the owner's decision. Everything mechanical is fixed.

1. **0 A.D. source (GPL-2.0-or-later engine, MPL-2.0 SpiderMonkey, LGPL OpenAL
   linked in).** daugasauron.com serves the prebuilt `zero-ad/pyrogenesis.wasm`
   but not its corresponding source; GitHub Pages does not ship zero-ad.
   Recommended fix: publish the pinned `0ad-0.28.0-unix-build.tar.xz` (158 MB;
   it contains SpiderMonkey 128.13) and a deterministic tar of
   `demos/zero-ad/toolchain` plus `openal-dolly.patch` as `SOURCE` inputs of
   `Dollyfile-zero-ad` (written by `toolchain/prepare-distribution.mjs`), and
   add the MPL-2.0 text and the notices of FreeType, libpng, Ogg/Vorbis,
   libxml2, ENet, libsodium and {fmt} to `/opt/0ad/licenses`. Costs 158 MB and
   eight 20 MiB Cloudflare parts; rebuilds zero-ad. The alternative, GPLv3
   §6(d) directions to Wildfire Games' and GitHub's copies, leaves availability
   to third parties.
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
