# The image catalog and metadata are JSON, not modules

- STATUS: OPEN
- PRIORITY: 120
- TAGS: catalog,site,npm,cleanup,0.1.5

## State (2026-11-04, 22:30): implemented on `core/catalog-json`; browser checks running

`de5db691a` writes and reads `dist/dolly-images.json` (`{ images, staticSources }`) and
`dist/dolly-IMAGE-system-snapshot.json`; `218ea702e` makes the verifier check the runtime's own
generated modules by their bytes, so `parseGeneratedConstant` is gone. Source suite 475/0.

A tree's `dist/` converts without a rebuild (no build running in it): each metadata module
becomes its `.json`, then `npm run routes` writes the catalog. The plan reuses every image (its
check cache keys the metadata's value, not its text).

```sh
node --input-type=module -e '
import { readdir, rename, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
for (const name of await readdir("dist")) {
  if (!/^dolly-.+-system-snapshot\.mjs$/.test(name)) continue;
  const { DOLLY_SYSTEM_SNAPSHOT } = await import(pathToFileURL(`dist/${name}`).href);
  const json = `dist/${name.replace(/\.mjs$/, ".json")}`;
  await writeFile(`${json}.tmp`, `${JSON.stringify(DOLLY_SYSTEM_SNAPSHOT, null, 2)}\n`);
  await rename(`${json}.tmp`, json);
  await rm(`dist/${name}`);
}
await rm("dist/dolly-images.mjs", { force: true });
' && npm run routes
```

| Check (this tree, image inputs `88959af6`) | Chromium | Firefox |
|---|---|---|
| `test/site-browser.mjs` | passed | passed |
| image, image-input, snapshot-stream, pack-store, custom-session, core | passed | passed |
| `published-version.mjs boot` of the archived v0.1.4 (`work/locks/published/v0.1.4`, served by `serve.mjs`): the module branch | passed | passed |
| pi ask-user and frontend (pi-runtime rebuilt for the docs pin) | passed | (Chrome only) |

`published-version.mjs boot` checks every published version after a deployment (checklist
step 7), and v0.1.0 to v0.1.4 keep their modules: it reads a version's catalog by its name,
the module before v0.1.5, the JSON since. A local candidate of this layout must therefore be
named v0.1.5, which the checklist demands anyway (step 1 refuses v0.1.4, published).

`docs/browser-boundary.md` changes with the boundary, and `Dollyfile-dolly-docs` pins it: the
next round rebuilds dolly-docs and the 11 images built on it (pi-dolly, pi-minimal, pi-runtime,
pi-agent, pi-local, pi-phone, bhop, classicube, rts-arena, slopyard, dollyfile-studio).

## The decision

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
