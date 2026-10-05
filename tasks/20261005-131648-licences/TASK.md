# Licences and upstream sources: a page on the site and an audit

- STATUS: OPEN
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
  Chrome: `/licences/` renders in the front page's font and colours, 76 rows for
  the domain catalog when generated with it, links resolve to public paths.
