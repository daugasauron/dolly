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
