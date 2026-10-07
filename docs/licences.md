# Licences

An engineering audit of what the sites distribute, as of 2026-10-05; not legal
advice. **Owner** marks points that need the owner's decision.

[`config/upstreams.json`](../config/upstreams.json) names every upstream the
catalog builds or bundles. Packaging generates `/licences/` from it
([`upstreams.mjs`](../scripts/upstreams.mjs)) for the site's catalog: project,
use, licence, pinned version, what the site serves and which recipes read it;
upstreams pinned only in demo files (Rust programs, models, 0 A.D. libraries)
show no version. [`upstreams.test.mjs`](../test/upstreams.test.mjs) fails when
a recipe `SOURCE` or a [`source-pins.sh`](../config/source-pins.sh) pin has no
entry.

## What the sites distribute

- **Runtime**: `dist/dolly.wasm` and the seed `dist/dolly.data`: Dolly, Emscripten
  and musl, LLVM's compiler, compiler-rt and headers, the Ghostty kernel plugin,
  and the Iosevka font.
- **Images**: snapshots of programs compiled in Dolly from pinned sources, plus
  files built outside Dolly: the Rust seed, model weights, fonts and game data.
- **Sources**: every canonical `SOURCE` of the catalog under `dist/static/`,
  the recipes and headers, at the same release path as the images. The gpu-fluid
  sources come from raw.githubusercontent.com instead.
- **Dolly's code**: MIT ([`LICENSE`](../LICENSE), `package.json`), except 10
  files marked `SPDX-License-Identifier: GPL-2.0-or-later` because they are
  compiled into GPL programs: the Seven Kingdoms port in `demos/rts`
  (`Makefile`, `OAUDIO.h`, `arena.*`, `config.h`, `input.*`, built with the game),
  the 0 A.D. `engine.patch`, and the Xonotic port's `Makefile` and
  `simd-unit.c`. The agents, spectators and viewers are separate
  programs that drive the games over pipes and screenshots; they are Dolly's own
  and MIT. The MIT grant covers Dolly's own files only; it does not relicense
  the upstream code an image contains.

## Obligations and status

| Family | Shipped as binaries | Obligation | Status |
| --- | --- | --- | --- |
| GPL-2.0/3.0 | Git, Make, Emacs, Seven Kingdoms, 0 A.D. engine, Xonotic (engine, game logic, data, fonts), Dolly's GPL files | Complete corresponding source, including build scripts, or a written offer | Met: the prepared source archives and the recipe that builds them are served beside the images, for 0 A.D. and Xonotic too (below) |
| IJG | libjpeg in Xonotic | Source: the unaltered `README` with it; binaries: the documentation states that the software is based in part on the work of the Independent JPEG Group | `README` kept as `/usr/share/licenses/libjpeg/README`; the statement is in the Xonotic section below and on `/licences/` |
| LGPL-2.0+ | OpenAL Soft, static in the 0 A.D. engine | Source, and the means to relink | Source served (`openal/source.tar`), and the engine's (below), so it can be relinked |
| MPL-2.0 | SpiderMonkey in 0 A.D.; MPL crates vendored by Codex | Source of the MPL files available; tell recipients where | Codex sources served; SpiderMonkey's pinned tarball is served (below); its MPL text is in `zero-ad` |
| Apache-2.0 | LLVM (with exception), TypeScript, Neovim, luv, Codex, WAMR, crates, npm packages | Licence copy, NOTICE files, modified files marked | Codex `NOTICE`, crates' notices and TypeScript notices shipped. LLVM's text is in every compiler image as `/usr/share/licenses/libcxx`; its exception covers runtime code compiled into programs |
| MIT, BSD, ISC, curl, Zlib, BSL | Most of the catalog | Copyright and permission notice with copies, binaries included (not for Zlib or BSL binaries) | Shipped in `/usr/share/licenses`, including musl, Emscripten and every vendored crate's own licence files |
| PSF-2.0 | CPython | Licence, and a brief summary of changes in a derivative | Both shipped (`DOLLY-CHANGES`) |
| CC-BY-SA-3.0 | 0 A.D. art and audio | Attribution and licence; share-alike for adaptations | The repacked mod archives keep `art/`, `audio/` and font licence files; repacking adapts nothing |
| OFL-1.1 | Iosevka; 0 A.D. fonts | Licence with the font; no sale of the font alone | Iosevka's name table carries the notice; fonts are unmodified |
| GPL-2.0-or-later with the font embedding exception | Xolonium and GNU Unifont 7.0.06 in Xonotic | Licence text with the font | `GPL-2` in the image; the fonts are unmodified inside the release's archives |
| Apache-2.0 weights | Qwen3.5-2B and 4B (GGUF by bartowski), MiniCPM5-2B | Licence copy; no use restrictions | Each model package keeps the licence copied into the demo; nothing checks it against the pinned Hugging Face revision |
| Anthropic Commercial Terms | Claude Code: nothing. The `closed-source-agent` image downloads 2.1.112 from the npm registry into the user's session after a notice; no file of it is in the repository, an image or a site | Unmodified binary, every built-in sign-in method kept, no paid or intermediated usage, no use of the names as a product name | Met by construction ([task](../tasks/20261007-085236-claude-code-image/TASK.md)); **Owner**: acceptance of the Commercial Terms |

## Combined binaries

- C and C++ programs link musl and Emscripten libc (MIT), compiler-rt and
  libc++ (Apache-2.0 WITH LLVM-exception) and Dolly's process library (MIT).
  All are compatible with GPL-2.0-only Git: the LLVM exception waives the
  sections that conflict with GPLv2.
- Git (GPL-2.0-only) links curl's API over Dolly's fetch-backed libcurl and
  zlib; Emacs (GPL-3.0-or-later) has no GPL-incompatible dependency. No
  program links GNU readline or ncurses.
- The 0 A.D. engine (GPL-2.0-or-later) links SpiderMonkey (MPL-2.0, whose
  secondary-licence clause allows the GPL combination), OpenAL Soft (LGPL),
  SDL2, FreeType, libpng, Ogg/Vorbis, ICU, Boost, {fmt}, libxml2, ENet and
  libsodium: all GPL-compatible. FreeType is dual-licensed and is used here
  under its GPL-2.0-or-later option: its own `LICENSE.TXT` calls the FTL
  incompatible with GPLv2. Seven Kingdoms (GPL-2.0-or-later) links
  SDL2 and Dolly's GPL-marked arena code.
- Codex (Apache-2.0) vendors 1,218 crates for every target and compiles 790
  into the binary: mostly MIT OR Apache-2.0; no crate is GPL-only (`self_cell`
  offers Apache-2.0, `r-efi` MIT). The compiled MPL-2.0 crates (`symphonia*`,
  `option-ext`) stay file-level copyleft; their source is served.
- Pi runs in QuickJS with npm packages under MIT, ISC, BSD-3-Clause,
  Apache-2.0, BlueOak-1.0.0 and Unlicense.

## GitHub Pages and Cloudflare

Serving is distribution whatever the host: each site carries the obligations
for the binaries it serves. Packaging takes sources from the same catalog
closure as the images, so each site serves its own catalog's sources, and
daugasauron.com keeps every published version's sources under that version's
path for as long as it serves the version. Each release records the Dolly commit that built
it (`release/source.commit`); the patches and preparation scripts behind a
prepared source are in that commit on GitHub. Neither host's terms change a
licence. `robots.txt` works only at a host root, so the GitHub Pages project
site under `/dolly/` carries an inert copy.

## 0 A.D.

0 A.D. is built in Dolly: `zero-ad-deps`, `zero-ad-spidermonkey` and
`zero-ad-engine` compile the engine, SpiderMonkey and the libraries it links
from `zero-ad-build/deps.tar.gz`, `mozjs.tar.gz` (SpiderMonkey 128.13's pinned
tarball without its test suites, with 0 A.D.'s patches and Dolly's) and
`engine.tar.gz`, which the site serves as recipe inputs. The game data's
SPIR-V shaders are translated to WGSL by `demos/zero-ad/toolchain` (the GLSL
sources stay in the served mod archives). The `zero-ad` image keeps the
licences of every statically linked library under `/usr/share/licenses/`,
SpiderMonkey's MPL-2.0 text and the licence files of the vendored Rust crates
compiled into its `libjsrust.a` (Mozilla's own crates are MPL-2.0).

## Xonotic

Xonotic 0.8.6 is built in Dolly: `xonotic-build` compiles DarkPlaces
(GPL-2.0-or-later), gmqcc (MIT), IJG libjpeg 9f (its own licence, the
`README` kept as `/usr/share/licenses/libjpeg/README`) and Dolly's files for
the port from `xonotic/source.tar.gz`, the release's source zip plus
libjpeg's tarball, which the site serves as a recipe input together with the
QuakeC game logic (`qcsrc`, GPL-3.0-or-later; `lib/warpzone` MIT or
GPL-2.0-or-later, `lib/csqcmodel` MIT) that gmqcc compiles there.
Dolly's own files compiled into the engine, `demos/xonotic/Makefile` and
`simd-unit.c`, carry `SPDX-License-Identifier: GPL-2.0-or-later`; the six
hunks of `darkplaces-dolly.patch` change engine files and take the engine's
licence. FreeType and libpng come as static libraries copied from
`zero-ad-deps` with their licence files; FreeType is used under its GPL
option, as in 0 A.D., and its source, `zero-ad-build/deps.tar.gz`, is in the
`xonotic` closure the site serves. The `xonotic` image takes the release's
`data`, `maps` and font archives unmodified as prebuilt files
(`xonotic/data/`, GPL-3.0-or-later by Xonotic's `COPYING`; the compiled
`progs.dat`, `csprogs.dat` and `menu.dat` inside `data.pk3` are the
release's; Xolonium and GNU Unifont 7.0.06 are GPL-2.0-or-later with the
font embedding exception, and the site serves their corresponding source
beside the image: GNU's `unifont-7.0.06.tar.gz`, whose precompiled TTF is
the shipped file, and `xolonium-v4.2.tar.gz` from the font's repository,
whose `xonotic/` directory and Makefile build the shipped GPL variant from
the FontForge sources) and keeps Xonotic's `COPYING`, `GPL-2` and
`GPL-3`, the warpzone and csqcmodel MIT notices, Xolonium's README,
Bitstream's notice for the Vera glyph sheet, Dolly's `NOTICE` (the IJG
sentence and the fonts' terms), gmqcc's `LICENSE`, libjpeg's, FreeType's,
libpng's and SDL2's under `/usr/share/licenses/`.
This software is based in part on the work of the Independent JPEG Group.
The pass over the shipped archives (task `20261006-122433-xonotic`,
2026-10-07) found every statement inside them GPL or GPL-compatible and none
under non-commercial, no-derivatives, Creative Commons or used-with-permission
terms. The owner's calls: the assets without a statement of their own rest
on the release grant; `gfx/vera-sans-big.jpg` is a Bitstream Vera glyph
sheet with no notice, upstream included; the release has no trademark
statement for the Xonotic name and logo.

## Fixed gaps

musl's and Emscripten's notices (kept by `system-build`), WAMR's licence in its
source archive, every vendored crate's licence files under
`/usr/share/licenses/PROGRAM/crates/` for rg, fd, protox and codex (123 of
Codex's crates ship none; their `Cargo.toml` names the licence), webgpu-headers'
notice in gpu-fluid, and CPython's change summary.

## Decisions

The owner delegated three decisions (task `20261005-135857-licence-owner`):

1. 0 A.D.'s missing corresponding source is now served (above).
2. Dolly's agents, spectators and viewers are MIT; only the 8 files compiled
   into Seven Kingdoms or 0 A.D. stay GPL-2.0-or-later.
3. ClassiCube's default texture pack names no licence: upstream's
   `license.txt` covers its code, `credits.txt` names Goodlyay as the artist,
   and when asked for the pack's licence (ClassiCube issue 1430, 2025-09-07) he
   granted permission to one named project only. Dolly ships its own MIT
   procedural textures instead (`demos/classicube/textures.mjs`).
