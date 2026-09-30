# No development server for the working tree

- STATUS: OPEN
- PRIORITY: 150
- TAGS: iteration,build

`npm run serve` reads only sealed releases (`README.md:62`), so seeing a JS change in a browser
requires `npm run publish` (a browser check per image). The only source-tree server is
`scripts/serve-gpu.mjs`, documented only in `docs/gpu.md:107`; `test/browser-server.mjs:26-49`
keeps a hand-maintained allowlist of served files.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

One documented command serves the working tree with current `dist/` for local development.

## Done when

- README documents the dev server; tests reuse it.
