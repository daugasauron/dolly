# Licences and upstream sources: a page on the site and an audit

- STATUS: CLOSED
- PRIORITY: 270
- TAGS: site,licences,audit

Owner (2026-10-05): "I want a link directly on the page highlighting the
licences and gitrepos that this project demos build on, and an audit of the
licences currently used by this project and the implications."

## Work

1. Inventory every upstream the catalog builds or bundles: recipe `SOURCE`
   lines, `docs/sources.md`, the toolchain seed, fonts, models and game data.
   For each: repository, pinned version, SPDX licence, and whether the sites
   distribute its source, a binary, or both.
2. A page generated from that inventory, served on both sites and linked from
   the front page. A hand-written list rots.
3. Audit: obligations per licence family for what is actually distributed
   (source offers for GPL binaries, notices, model and data licences), what is
   linked together into one binary, Dolly's own licence and whether the
   repository states it, and the concrete gaps with their fixes. Not legal
   advice; mark what needs the owner's decision.

The same agent takes `20261005-131527-robots-txt`.

## Done when

- The front page links a page listing every upstream with repository and licence.
- The audit and its gaps are recorded in `docs/` or here.
- A test fails when a recipe source has no inventory entry.

## Decisions (2026-10-05)

- One table, `config/upstreams.json`, beside `source-pins.sh`: per upstream its
  name, use, SPDX licence, repository, the `SOURCE` URLs it matches and its
  `source-pins.sh` keys. Versions come from those pins (or a commit in the
  `SOURCE` URL). Recipes are untouched: a comment beside each `SOURCE` would
  change every recipe pin and rebuild every image. Demo pin files
  (`sources.json`, `models.json`, `dependencies.tsv`) are not read, so the core
  scripts do not depend on `demos/`; those rows show no version.
- `scripts/upstreams.mjs` matches every catalog `SOURCE` to rows and fails on
  an unmatched one; `generate-routes.mjs` writes `licences/index.html` (ignored
  like the other generated pages) from `menu.html`'s style, for the selected
  catalog only. Pi's npm rows come from the `package.json` files inside the
  published `pi-runtime-packages.tar`, so they list exactly what ships.
- "Built by" lists the images whose own recipe reads the source, linked to
  their Dollyfile views; images built from them contain it too. The audit
  measured containment from snapshot manifests instead.
- Rust crates are one row whose licence is the union measured from the
  published crate archives: Codex vendors 1,218 crates, ripgrep 50, fd 128,
  protox 115.
- Licence identifiers were read from the licence files in `dist/static` tars,
  `.cache` checkouts and the font's name table, and checked against the SPDX
  list in npm's `spdx-license-ids` 3.0.23. One True Awk's Lucent notice is
  mapped to `SMLNJ`, whose text it matches apart from names.

## Audit

`docs/licences.md`: obligations per licence family, linked combinations,
Dolly's MIT scope, the effect of the two hosts, and the gap list.

Measured with the snapshot manifests (`dist/dolly-IMAGE-system-snapshot.mjs`)
of the domain catalog: every image with the compiler carries `libcxx`,
`libcxxabi`, `awk`, `curl`, `git`, `make`, `samurai`, `sbase`, `zlib`,
`ghostty`, `uucode` under `/usr/share/licenses`, but none carries musl or
Emscripten; `gpu-fluid` lacks webgpu-headers; Rust programs carry only their
own licence; `zero-ad` keeps ICU, 0 A.D., OpenAL, GPL-2.0, LGPL-2.1 and MIT
texts in `/opt/0ad/licenses` but no MPL-2.0 or linked-library notices; and no
site serves the 0 A.D. engine's source.

## Evidence

- `node --test test/upstreams.test.mjs`: passes; deleting the Git row fails it
  with `Dollyfile-system-tools:215: …/git.tar has no entry`, dropping the
  `EMSDK` pin fails it with `source pin EMSDK has no entry`.
- `node test/site-browser.mjs chromium`: passed; the menu links `/licences/`,
  every catalog image that downloads sources is attributed there and each
  attribution opens an existing view.
- Scratch release `dc66eb0b…` (`DOLLY_BUILD_IMAGES=default`, site
  `daugasauron.com`) served by `serve.mjs` on port 9417 and opened in headless
  Chrome: the front page links `/licences/`, which renders in the front page's
  font and colours with public links to the views. Generated for the domain
  catalog the page has 110 rows (34 of them Pi's npm packages), for GitHub
  Pages 89.

## Fixes (2026-10-05)

- `b862c710`: gpu-fluid keeps webgpu-headers' licence. Rebuilt gpu-fluid
  (34 s); its manifest lists `/usr/share/licenses/webgpu-headers`. The GPU
  browser test needs a display and was skipped.
- `3d19cd1b`: `system-build` keeps musl's `COPYRIGHT` (read from the pinned
  Emscripten commit; the sparse checkout omits musl) and Emscripten's
  `LICENSE`; `wamr.tar` carries WAMR's `LICENSE`; the Rust source preparation
  maps each vendored crate's licence and notice files to
  `/usr/share/licenses/PROGRAM/crates/`. This changes the root recipe, so every
  image rebuilds after re-pinning. Rebuilt `system-build` (36 s) and the
  `default` chain (902 s, Zig and Ghostty included): `default` and `zig-build`
  list `musl` and `emscripten`; `node test/core-browser.mjs chromium` passed on
  the new `default` (41 s). Rebuilt ripgrep, fd and protox: 48, 113 and 112
  crate directories (0.5, 1.2 and 1.2 MB of text). The prepared Codex source
  adds 1,918 licence files (9.7 MB uncompressed) for 1,218 vendored crates.
- CPython's `DOLLY-CHANGES` summary is a `FILE` in `Dollyfile-python`
  (PSF-2.0 §3); `npm run -s test:source` passes with it.
- Not rebuilt here, on the coordinator's memory rule (the Codex build was
  stopped after 38 minutes): `codex-build`/`codex` (crate notices) and
  `python` (`DOLLY-CHANGES`). The 02:30 catalog rebuild proves them; check
  `/usr/share/licenses/codex/crates/` and
  `/usr/share/licenses/cpython/DOLLY-CHANGES`.
- `.cache/sbase-c546c3a…` (a shared checkout) holds a native sbase build and
  stray files `f`, `g` from 23:06, so `prepare-image-sources.sh` refuses every
  selection that includes `system-tools` until it is cleaned. Not mine; left
  untouched.

The open points need the owner: `20261005-135857-licence-owner`.

Closed 2026-10-05: page, test and audit in `a80a37e3`; fixes in `b862c710`,
`3d19cd1b` and the CPython summary commit.

## Next round (2026-10-06)

Round 2 builds 0 A.D. inside Dolly. `config/upstreams.json` now maps its build
inputs (`zero-ad-build/deps.tar.gz`, `engine.tar.gz`, `mozjs-host.tar.gz`) and
Qwen3.5-0.8B; licences read from the trees `prepare-build-sources.sh` extracts
from `.cache/0ad/` (pkgconf ISC, Premake BSD-3-Clause, CxxTest LGPL-3.0, ICU 68
Unicode-DFS-2016 with ICU and BSD-3-Clause dictionary sections, FreeType
FTL OR GPL-2.0-or-later) and the GGUF's `general.license` (apache-2.0).
Remaining:

1. WIP commit `98803d3f` on `work/licences` (unverified, not in the round-2
   candidate) puts the licence texts of the libraries statically linked into
   the engine, and SpiderMonkey's MPL-2.0 text, in the `zero-ad` image under
   `/usr/share/licenses/`: `deps.tar.gz` and `mozjs-host.tar.gz` map them,
   `zero-ad-deps` and `zero-ad-engine` retain them and `zero-ad` copies them.
   Rebase it onto the `Dollyfile-sdl2` rename (its SDL2 licence `COPY` still
   names `demos/sdl2/Dollyfile-sdl2-build`), then verify with a
   `zero-ad-deps,zero-ad-engine,zero-ad` chain build that those directories
   exist in `zero-ad`.
2. `docs/licences.md` still describes the prebuilt engine: rewrite gap 1 as in
   `20261005-135857-licence-owner` point 1, and say FreeType is used under its
   GPL-2.0-or-later option (its `LICENSE.TXT` calls the FTL GPLv2-incompatible).
3. `libjsrust.a` links Rust crates from SpiderMonkey's `third_party/rust`; their
   notices are not shipped.
