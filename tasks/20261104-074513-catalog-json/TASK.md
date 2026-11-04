# The image catalog and metadata are JSON, not modules

- STATUS: OPEN
- PRIORITY: 120
- TAGS: catalog,site,npm,cleanup,0.1.5

## State (2026-11-04, 23:00): implemented on `core/catalog-json`; demo checks running

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
| ending, host-compute, nena, pty, shell-env, sockets, threads | passed | passed |
| `package-pages.sh` of default's closure (`DOLLY_BUILD_IMAGES=default`): 19 images, 87 packs, acceptance of default, ghostty-build, system-build, system-tools and zig-build; then `site-release.mjs verify` and `export-static.mjs` | release `fc74ab53...` | |
| `published-version.mjs boot` of that release, the JSON branch (the boundary moved to v0.1.4 for the run, not committed) | passed | passed |
| `npm-browser.mjs` (after merging integrate's html@0 fix and building python-data): the guide's page, the devices and lacking pages, the README's Pi project and python-data's own recipe, each built by `dolly-build` in that browser into the new layout and booted | passed (226 s) | passed (191 s) |
| emacs demo (gnu-emacs rebuilt) | passed | passed |
| tmux demo (tmux-panes and vi rebuilt) | passed | passed |
| python-data demo (python-data and openblas rebuilt) | passed | passed |
| `tools`, `cpython` and `gamedev` artifact tests, `zig-sdk.artifacts.mjs`, and dolly.artifacts' three catalog tests | passed (Node) | |

`published-version.mjs boot` checks every published version after a deployment (checklist
step 7), and v0.1.0 to v0.1.4 keep their modules: it reads a version's catalog by its name,
the module before v0.1.5, the JSON since. A local candidate of this layout must therefore be
named v0.1.5, which the checklist demands anyway (step 1 refuses v0.1.4, published).

Not run here, for the round: `test/amy-browser.mjs` (77 of the 138 packages are not yet built
with the new seed), the llvm demo (llvm-build and llvm-runtimes), and dolly.artifacts' sealing
test over every snapshot. Their changes are the same catalog and metadata reads that pass above.

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

## Lessons

- A change to the layout of published files reaches the checks of the versions already
  published: `published-version.mjs boot` runs on v0.1.0 to v0.1.4 after every deployment.
  Grepping for the file names found the reader. Seeing that it reads versions whose files never
  change took reading the checklist's step 7.
- Dropping a parser of generated code leaves a simpler check: regenerate the file and compare
  the bytes. The verifier already checked the catalog that way, and the runtime's identity
  modules now get the same check. Parsing is never needed when the generator is at hand.
- A branch made from the integration branch is not what the round builds. The round built
  uncommitted Rust and Go seed pins, and `dist/static` (hard-linked to the round's tree) changed
  under this tree, so `npm run routes` failed on a digest. Reading `git diff` in work/integrate
  read-only and copying its pins made the round's images reusable.
- Building the images a test opens, before the round reaches them, finds the round's failures
  early. tmux-panes, gnu-emacs and python-data-build failed here in minutes on the missing
  html@0 declaration, which the round would have hit hours later (f0f5aff9c fixed it).
- An edit to the review map the boundary requires is not free: `Dollyfile-dolly-docs` pins
  `docs/browser-boundary.md`, so every boundary decision rebuilds dolly-docs and the 11 images
  of the Pi chain built on it.
