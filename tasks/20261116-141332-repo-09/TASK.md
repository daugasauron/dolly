# package.json: four npm scripts nothing runs or documents, and one dead export

- STATUS: CLOSED
- PRIORITY: 40
- TAGS: audit,repo,cleanup,0.1.8

## Closed (2026-11-17)

On `cleanup/0.1.8`: `abi`, `routes`, `publish` and `export:pages` are gone from `package.json`,
`menuGroups` from `scripts/image-menu.mjs`, and `scripts/serve.mjs`'s error names
`bash scripts/package-pages.sh`. Each remaining script is named by `README.md`, `docs/` or a
demo's README (`git grep "npm (run )?NAME"`). `npm run -s test:source` without `dist/`: 448 of
453 pass; the five failures are the known missing `dist/dolly-build-id.mjs` and
`dist/dolly-process-abi.mjs`.

## Found

The Zen: "Removing code is a win". `git grep` of the checkout (not `tasks/`) and of `work/*.sh`
finds no use of these:

- `npm run abi` (`package.json:9`, since 2026-08-29): `dolly-abi.mjs inspect` of two contract
  files. It works (it prints `build/dolly-process-0.wasm`'s imports). Nothing runs it or names it.
- `npm run routes` (`:11`): `scripts/generate-routes.mjs`. `scripts/build-image.mjs:44` runs the
  script itself, and no document names the alias.
- `npm run export:pages` (`:16`): `docs/deployment.md` and the checklist call
  `scripts/export-cloudflare-pages.mjs` directly.
- `npm run publish` (`:15`): `scripts/package-pages.sh` with no argument. Only
  `scripts/serve.mjs:136`'s error message names it, and `docs/deployment.md` calls
  `bash scripts/package-pages.sh` instead. `publish` is also an npm lifecycle name, so the script
  would run after an `npm publish` of the root package if that package were not private.
- `menuGroups` (`scripts/image-menu.mjs:50`): exported and named nowhere, in that file or any other.

## Do

Remove the four `scripts` entries and `menuGroups`. `serve.mjs:136` then names
`bash scripts/package-pages.sh`.

## Done when

`package.json` lists only scripts that a document, test or script names. `npm run test:source`
passes.
