# Investigate serving the whole frontend as plain static JavaScript

- STATUS: OPEN
- PRIORITY: 200
- TAGS: site,frontend,build,design

Owner request (2026-10-01): the complete frontend should be plain JavaScript,
HTML and CSS that any static file server can serve as-is: no TypeScript, no
bundler, no framework.

## Today

- The core frontend is already plain ES modules (`src/*.mjs`,
  `host/*/*.mjs`, `index.html`, `terminal.html`): no TypeScript, no framework.
  npm dependencies: `esbuild` and `playwright-core` for development, and the Pi
  packages, which only feed the Pi demo image.
- Build steps that still generate or transform served files:
  - esbuild bundles the process Worker into `dist/dolly-process-worker.mjs`
    (`scripts/bundle-process-worker.mjs`);
  - Emscripten emits the kernel glue `dist/dolly.mjs`;
  - `scripts/generate-routes.mjs` writes one HTML page per image route and the
    image registry `dist/dolly-images.mjs`; generated constants modules
    (`src/process-constants.mjs`, `host/*/abi.mjs`, `dist/dolly-errno.mjs`);
  - `scripts/site-release.mjs` seals releases under `/_dolly/<digest>/` and
    rewrites asset URLs;
  - `scripts/export-cloudflare-pages.mjs` splits large files and writes
    `_headers`; `scripts/package-pages.sh` adds `coi-serviceworker.js` for
    GitHub Pages.
- Hosting requirement: cross-origin isolation (COOP/COEP) for shared Wasm
  memory. A static host must send those headers, or rely on the
  service-worker workaround.

## Investigate

- Which steps are data generation (fine as static files) and which are
  build-time templating or bundling that could go: the process Worker as a
  module Worker without esbuild, one static page for all image routes, sealing
  for local serving.
- Which static hosts allow the headers and file sizes Dolly needs.

## Done when

- A decision per step above, with a prototype: the repository's frontend and
  `dist/` served by a plain static file server that only adds the isolation
  headers, booting an image in Chrome and Firefox, with anything still missing
  measured.

## Findings (Fable, 2026-10-01)

Prototype in `prototype/`: `static-serve.mjs` (30-line Node server: one
directory, `index.html` for directories, MIME by extension, COOP/COEP/CORP, no
rewrites or sealing) and `pyserve.py` (stock `python3 -m http.server` plus a
10-line handler adding the two headers), both serving the checkout root of
`work/static-frontend` (`takeover-20260930`, images at `6efbcb13`). The route
page was `terminal.html` with `{{DOLLY_ROUTE_HEAD}}` removed, `{{DOLLY_BASE}}`
→ `./` and `DOLLY_BOOT` read from `?image=&mode=` (a `sed` over the template,
saved as `boot.html` at the root). `measure-boot.mjs` drove headless Chrome and
Firefox; raw numbers in `measurements.jsonl`.

- Boots in both browsers from the plain server: Chrome ready 2.8 s, shell
  prompt 2.9 s; Firefox 3.7 s / 3.9 s (cold cache, `no-store`). 189 requests,
  49.3 MB: 26 snapshot packs (45.6 MB) and 162 small files (3.7 MB: `src/`,
  `host/` modules and `module.json` manifests, registry, snapshot metadata,
  Dollyfiles and `.dm` modules). Python server: Chrome ready 3.0 s. Nothing in
  `src/`, `host/` or `dist/` needed a transform; JSON module imports and the
  `.wasm`/`.mjs` MIME types are the only server requirements.
- One page serves every route, but the repository tree is only servable as-is
  for core images: `?image=python` failed with `/modules/libffi.dm` 404. Demo
  recipes live in `demos/DEMO/` while the registry's `sourcePath` is the flat
  `/modules/NAME.dm` namespace (`scripts/recipe-files.mjs`) that
  `test/browser-server.mjs` maps and `package-pages.sh` copies. Either the
  served namespace becomes the tree layout (changes recipe `sourcePath`, hence
  image identity) or a staging copy stays for demo images.

Per step:

1. esbuild process Worker bundle: keep, as a `dist/` artifact like
   `dolly.mjs`. Measured the alternative (`new Worker(new
   URL("./process-worker.mjs", import.meta.url), { type: "module" })`): works
   in Chrome and Firefox, but every spawn fetches 11 modules. `true` took
   41 ms Chrome / 30 ms Firefox with `no-store` and 21 / 29 ms with
   `immutable` caching (0 server hits, cache lookups per module), against
   12 / 16 ms with the Blob; `seq 1 100 | xargs -n1 true` 2.1 s / 2.5 s
   (`no-store`), 1.3 s / 2.2 s (`immutable`), against 0.62 s / 1.04 s. With
   the network cut (Playwright abort, which also bypasses the cache) spawns
   fail with 126; the Blob keeps spawning, which `test/core-browser.mjs`
   asserts. Removing esbuild otherwise means a hand-written bundler or
   duplicating ~50 KB of shared code into the worker. esbuild only
   concatenates this 11-module graph (16 lines, one devDependency); it never
   touches page code.
2. Emscripten `dist/dolly.mjs`: compiler output, a plain ES module
   (`new URL("dolly.wasm", import.meta.url)`); data, keep.
3. Generated constants (`src/process-constants.mjs`, `host/*/abi.mjs`,
   `dist/dolly-errno.mjs`, `dist/dolly-*-abi.mjs`, build ids,
   `dist/dolly-images.mjs`, `dist/dolly-*-system-snapshot.mjs`): data derived
   from the C/WAT ABI and the image build, plain modules; keep.
4. `scripts/generate-routes.mjs` does four things. (a) The registry
   (`writeImageRegistry`) is data: keep. (b) 66 route pages from the
   `terminal.html` placeholders, plus `load/`, `session/open.html` and
   `404.html`, are templating: one static page reading `?image=&mode=` and
   `?session=NAME` replaces them. That removes the placeholders and
   `DOLLY_ROUTE_HEAD`, `session/open.html` and `404.html`, the `/session/NAME`
   mapping in `coi-serviceworker.js`, `scripts/serve.mjs`,
   `scripts/release-layout.mjs` and `test/browser-server.mjs`, the route
   copies in `package-pages.sh` and the stubs in `package-github-pages.mjs`.
   It changes the public URLs (`/pi/` → `terminal.html?image=pi`,
   `/pi/rebuild/` → `&mode=rebuild`, `/session/NAME` → `?session=NAME`) and
   the links in `index.html`, `sessions.mjs`, `custom-dollyfile.mjs`,
   `custom-image.mjs`, `image-menu.mjs`, the docs and about 25 test sites
   including demo fixtures. Directory URLs inherently need one file per route
   or a rewriting server, so this is the owner's URL decision, not a cleanup.
   (c) Menu rows written into `index.html` from README descriptions are
   templating: the registry could carry `description` and `index.html` render
   the table from `dist/dolly-images.mjs` in ~15 lines (`test/site-browser.mjs`
   asserts the menu has no script today). (d) The 908 Dollyfile view pages
   (17 MB, `render-dollyfile-view.mjs`) are static rendering of data; keeping
   them as generated HTML or rendering in the browser with
   `src/dollyfile-view.mjs` costs about the same code.
5. `site-release.mjs` sealing: not needed for serving (the checkout served
   directly; `test/browser-server.mjs` has always worked this way). It is
   release packaging: immutable `_dolly/<digest>/` caching, atomic switch for
   open tabs and manifest verification. Without it a plain host revalidates
   the 162 non-pack files per boot (ETag 304s); packs are content-addressed and
   cacheable by path on any host with per-path rules. Note the export injects
   `<base href>` into every HTML page, so deployed HTML differs from the repo's.
6. `export-cloudflare-pages.mjs` (Brotli, 20 MiB parts, `_headers`) exists for
   Cloudflare Pages' 25 MiB file and 20,000 file limits; nginx or an own origin
   needs none of it. `coi-serviceworker.js` is needed only where headers cannot
   be set; `test/site-browser.mjs` proves that path.

Hosts, probed 2026-10-01:

| Host | Isolation headers | Sizes | Caching |
| --- | --- | --- | --- |
| nginx, Caddy, own origin | two `add_header` lines | none | any; measured here with 30-line Node and 12-line Python servers |
| Cloudflare Pages (daugasauron.com) | `_headers`; live site sends COOP/COEP/CORP | 25 MiB per file, 20,000 files: Brotli and parts | `immutable` on `_dolly/` live |
| GitHub Pages (daugasauron.github.io/dolly) | none; `coi-serviceworker.js` | 1 GB site; serves `dolly.data` 112.7 MB and `zig.wasm` 48.5 MB plain | fixed `max-age=600`, so sealing buys only release atomicity |

Recommendation: keep the bundled worker and every data-generation step; decide
the URL scheme. With `terminal.html?image=…` routes the frontend is the checkout
plus `dist/` and generation shrinks to data (registry, constants, view pages);
with directory URLs the route stubs stay generated. Separately decide whether
demo recipes keep their staging copy or the served namespace follows the tree.
No code was changed on the branch: the one step that measured as removable is
the URL decision above.
