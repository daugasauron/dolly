# The image catalog and metadata are JSON, not modules

- STATUS: OPEN
- PRIORITY: 120
- TAGS: catalog,site,npm,cleanup

`dist/dolly-images.mjs` and `dist/dolly-IMAGE-system-snapshot.mjs` are JavaScript modules
(`export const X = Object.freeze(…)`): a page runs the code of any image directory it boots, and
the release verifier parses them with `parseGeneratedConstant`, a parser for JSON wrapped in
JavaScript ("Generated metadata is data, not executable input to the release verifier";
`tasks/20261101-074223-audit-runtime`, "For the owner"). As `.json`, read with
`import(url, { with: { type: "json" } })` as the host manifests already are, an embedding can boot
an image directory it does not trust, and the parser goes. Cost: the writers
(`image-definitions.mjs`, `build-system-snapshot.mjs`, `share-pages-snapshots.mjs`), 5 page
modules, 10 scripts, 16 tests and 9 demo tests name the files; `dist/` converts without a
rebuild; the npm image packages change layout, so it goes with a version, not a patch.

Decided 2026-11-04 (`tasks/20261102-133353-owner-decisions`): yes. Data as data; AGENTS.md's rule
that JSON is not an ABI source is about the machine contract, which the catalog is not.

Prefetching the next pack during a boot (the same section: pi-minimal's 35 packs take 4.2 s at a
100 ms round trip): no. It is the performance machinery AGENTS.md weighs against serial semantics,
for seconds of a first boot; the repeated downloads, which the owner measured as the pain, are
`tasks/20261103-111707-cache`'s. Measure a first boot of pi-phone over the phone's network after
that task lands before reopening it.

Done when: the catalog and every image's metadata are `.json` and no `.mjs` metadata is written or
read (`parseGeneratedConstant` is gone); `npm run routes`, the release verifier
(`scripts/site-release.mjs`), `test/site-browser.mjs`, `test/npm-browser.mjs`,
`test/image-browser.mjs` and the demo tests pass in Chromium and Firefox; `dolly-build` packs and
boots the new layout; the release checklist names the version it goes with.
