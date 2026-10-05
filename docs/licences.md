# Licences

An engineering audit of what the sites distribute, as of 2026-10-05; not legal
advice. **Owner** marks points that need the owner's decision.

[`config/upstreams.json`](../config/upstreams.json) names every upstream the
catalog builds or bundles. Packaging generates `/licences/` from it
([`upstreams.mjs`](../scripts/upstreams.mjs)) for the site's catalog: project,
use, licence, pinned version, what the site serves and which recipes read it.
[`upstreams.test.mjs`](../test/upstreams.test.mjs) fails when a recipe
`SOURCE` or a [`source-pins.sh`](../config/source-pins.sh) pin has no entry.

## What the sites distribute

- **Runtime**: `dist/dolly.wasm` and the seed `dist/dolly.data`: Dolly, Emscripten
  and musl, LLVM's compiler, compiler-rt and headers, the Ghostty kernel plugin,
  and the Iosevka font.
- **Images**: snapshots of programs compiled in Dolly from pinned sources, plus
  files built outside Dolly: the 0 A.D. engine, the Rust seed, model weights,
  fonts and game data.
- **Sources**: every canonical `SOURCE` of the catalog under `dist/static/`,
  the recipes and headers, at the same release path as the images. The gpu-fluid
  sources come from raw.githubusercontent.com instead.
- **Dolly's code**: MIT ([`LICENSE`](../LICENSE), `package.json`), except 33
  files marked `SPDX-License-Identifier: GPL-2.0-or-later`: the Seven Kingdoms
  arena port and spectator, the shared game-agent code and agents built on it,
  and the 0 A.D. engine patch. The MIT grant covers Dolly's own files only; it
  does not relicense the upstream code an image contains.

## Obligations and status

| Family | Shipped as binaries | Obligation | Status |
| --- | --- | --- | --- |
| GPL-2.0/3.0 | Git, Make, Emacs, Seven Kingdoms, 0 A.D. engine, Dolly's GPL files | Complete corresponding source, including build scripts, or a written offer | Met for programs built in Dolly: the prepared source archives and the recipe that builds them are served beside the images. **Gap 1** for 0 A.D. |
| LGPL-2.0+ | OpenAL Soft, static in the 0 A.D. engine | Source, and the means to relink | Source served (`openal/source.tar`); relinking needs the 0 A.D. source (gap 1) |
| MPL-2.0 | SpiderMonkey in 0 A.D.; MPL crates vendored by Codex | Source of the MPL files available; tell recipients where | Codex sources served; SpiderMonkey is gap 1 |
| Apache-2.0 | LLVM (with exception), TypeScript, Neovim, luv, Codex, WAMR, crates, npm packages | Licence copy, NOTICE files, modified files marked | Codex `NOTICE` and TypeScript notices shipped. LLVM's text is in every compiler image as `/usr/share/licenses/libcxx`; its exception covers runtime code compiled into programs. **Gap 4** for WAMR's source |
| MIT, BSD, ISC, curl, Zlib, BSL | Most of the catalog | Copyright and permission notice with copies, binaries included (not for Zlib or BSL binaries) | Shipped in `/usr/share/licenses` except **gaps 2, 3, 5** |
| PSF-2.0 | CPython | Licence, and a brief summary of changes in a derivative | Licence shipped; **gap 6** |
| CC-BY-SA-3.0 | 0 A.D. art and audio | Attribution and licence; share-alike for adaptations | The repacked mod archives keep `art/`, `audio/` and font licence files; repacking adapts nothing |
| OFL-1.1 | Iosevka; 0 A.D. fonts | Licence with the font; no sale of the font alone | Iosevka's name table carries the notice; fonts are unmodified |
| Apache-2.0 weights | Qwen3.5-2B (GGUF by bartowski), MiniCPM5-2B | Licence copy; no use restrictions | Each model package keeps the licence copied into the demo; nothing checks it against the pinned Hugging Face revision |
| Unclear | ClassiCube's default texture pack | None stated | Shipped with ClassiCube's BSD-3-Clause `license.txt`, which names no assets. **Owner**: accept that reading or drop the pack |

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
  SDL2, FreeType (FTL), libpng, Ogg/Vorbis, ICU, Boost, {fmt}, libxml2, ENet
  and libsodium: all GPL-compatible. Seven Kingdoms (GPL-2.0-or-later) links
  SDL2 and Dolly's GPL-marked arena code.
- Codex (Apache-2.0) vendors 1,218 crates for every target: mostly
  MIT OR Apache-2.0; no crate is GPL-only (`self_cell` offers Apache-2.0, `r-efi`
  MIT). MPL-2.0 crates (`symphonia*`, `option-ext`) stay file-level copyleft.
- Pi runs in QuickJS with npm packages under MIT, ISC, BSD-3-Clause,
  Apache-2.0, BlueOak-1.0.0 and Unlicense.

## GitHub Pages and Cloudflare

Serving is distribution whatever the host: each site carries the obligations
for the binaries it serves. Packaging takes sources from the same catalog
closure as the images, so each site serves its own catalog's sources, and
Cloudflare keeps a predecessor's sources at its immutable `_dolly/` paths
while it keeps that release. Each release records the Dolly commit that built
it (`release/source.commit`); the patches and preparation scripts behind a
prepared source are in that commit on GitHub. Neither host's terms change a
licence. `robots.txt` works only at a host root, so the GitHub Pages project
site under `/dolly/` carries an inert copy.

## Gaps

1. **Owner**: the 0 A.D. engine's source is not served. Fix: publish the
   pinned `0ad-0.28.0-unix-build.tar.xz` (158 MB; it contains SpiderMonkey)
   and a tar of `demos/zero-ad/toolchain` and `openal-dolly.patch` as `SOURCE`
   inputs of `Dollyfile-zero-ad`, and add the MPL-2.0 text and the linked
   libraries' notices to `/opt/0ad/licenses`. Rebuilds zero-ad.
2. musl's and Emscripten's notices are in no image although every program
   links them. Fix: `system-build` keeps both under `/usr/share/licenses`.
   Rebuilds every image.
3. Rust programs ship their own licence but not their crates' notices (rg, fd,
   protox, codex). Fix: copy each compiled crate's licence files to
   `/usr/share/licenses/PROGRAM/crates/` from the Patti build record.
4. WAMR's source archive lacks WAMR's own `LICENSE`. Fix: add it to `wamr.tar`.
5. gpu-fluid lacks webgpu-headers' BSD-3-Clause notice. Fix: the recipe
   downloads and keeps it.
6. CPython ships without a summary of Dolly's changes (PSF-2.0 §3). Fix: keep a
   short `DOLLY-CHANGES` beside its licence.
7. **Owner**: only the arena code compiled into Seven Kingdoms and the engine
   patch must stay GPL. The other GPL-marked files (agents, spectator, viewers)
   are Dolly's own code running as separate programs; their licence is the
   owner's choice.
8. Versions of upstreams pinned outside `source-pins.sh` (Rust programs,
   models, 0 A.D. libraries) are blank on the licences page.
