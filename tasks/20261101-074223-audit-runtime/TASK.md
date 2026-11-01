# Audit: the browser runtime, page and module loading

- STATUS: OPEN
- PRIORITY: 300
- TAGS: core,audit,runtime

Owner, 2026-11-01: a complete audit of the core to make it stable, small, lean and nice;
first principles, no workarounds; audit, improvements and lessons learnt
(`work/AGENT-RULES-2026-11-01.md`). Agent A's part: the page and the runtime Worker
(`src/browser.mjs`, `runtime-worker.mjs`, `worker-image.mjs`, `site.mjs`, the image and
session modules), building on the page (`image-build*.mjs`, `build-worker.mjs`,
`custom-*.mjs`), the registry (`host/modules.mjs`, `manifests.mjs`, `requirements.mjs`,
`host/runtime/`) and the scripts that serve, build and package the site. Branch
`core/audit-runtime` from `main` `577aafb1`.

Done when: each finding below is fixed with its browser evidence, closed as moot with the
reason, or left as a few lines for the owner.

## State (2026-11-01 18:25 JST)

Findings 1 to 7 and 9 to 13 are committed, each verified as its commit says (source suite;
Chromium and Firefox suites in `build/audit-runtime-evidence/run2.log` to `run7.log`);
8 is left to `demo/lean-2`. The docs repin of finding 7 restales `dolly-docs` and the eleven
demo images that install it, so in this tree `amy` (which installs `dolly-docs`) and the npm
packages suite (`pi-minimal`) fail until a catalog round rebuilds them; both passed on the
commits before the repin. Next: the rest of the flows (Studio builds, the sessions page), a
last full run of the suites this branch touches.

## Findings

1. **Snapshot encodings no build writes.** The page's loader (`packaged-snapshot.mjs`), the
   release check (`site-release.mjs`) and the checkout server accepted metadata without
   `encoding` (a raw `dist/dolly-IMAGE-system.snapshot`) or with `"gzip"`
   (`…-system.snapshot.gz`). Since `670695f9` (2026-09-24) `build-system-snapshot.mjs` packs
   every image as it builds it and `share-pages-snapshots.mjs` writes `"packs"` for every
   published one; all 215 metadata files of this tree's catalog say `"packs"` (the four
   others are September leftovers of images no recipe builds). Fix: packs only; the server
   no longer serves raw snapshots, which no page fetched (`image-browser` asserts so).
   The loaders lose their unused `image` argument (one call in `host/packages/service.mjs`).
2. **Session encoding `identity`.** `session-store.mjs` read and validated sessions stored
   uncompressed; nothing has written one since `89d66e23` (2026-10-01, before 0.1.0), and
   every version since 0.1.0 has its own database (`dolly-sessions-vX.Y.Z`), so no reachable
   save holds one. Fix: gzip only; the tests that wrote identity records write gzip ones (the
   broken-delta case still reaches the kernel's restore: 16 zero bytes, gzipped).
3. **The configure and ready messages carried fields nobody reads.** `boot()` sent
   `mode: "snapshot"` and `runtime-worker.mjs` refused anything else, but only the site's
   build Worker has modes (the site's routes send their own). The Worker's `ready` carried
   `routeImage`, `buildId` and `hostModules`; the page read only `image`, and checked
   `routeImage`/`image` against what it asked for after the Worker had already refused a
   restored image whose `/etc/dolly/image` differs. `stage()` sent `error: false`, which no
   reader reads. `run()` cleared a log it had just created. Fix: the fields, the page's
   duplicate check and the `running(ready, host)` argument go.
4. **`hostRequirements ?? []` where the catalog always has the list.** `registrySource()`
   always writes `hostRequirements` and `loadPackagedSnapshotMetadata` already requires the
   metadata's to equal it; `runtime-worker.mjs` chose between the two. Fix: read the
   catalog's.
5. **The trusted sources list was built in four places.** `browser.mjs`,
   `scripts/page-image-build.mjs` and two tests each made http@0's trusted sources (every
   recipe and source of the image directory with its size) from the catalog. Fix:
   `bootstrapSources()` in `images.mjs`, which loads the catalog.
6. **A rebuild route ships the whole image to the page and hashes it twice.** On a route that
   builds and runs (`/IMAGE/rebuild/`, `/custom/rebuild/`), `build-worker.mjs` describes the
   snapshot (decode and SHA-256), saves it to the image cache, then transfers the bytes to the
   page, which holds them for the tab's life (`__dolly.systemSnapshot`) only to hash them
   again: `site.mjs` describes them once more for a custom image before the Worker's 10 s
   `entry-ready-ack` deadline, and `verifyBase` hashes them at the first save of a rebuilt
   catalog image. Fix: the Worker sends the identity it computed (`image-built`), the page
   keeps that (`__dolly.builtImage`); bytes travel to the page only for the image builder
   (`buildOnly`), whose callers need them.
7. **The review map's trusted files were incomplete and called generated modules data.**
   `docs/browser-boundary.md` left out `image-names.mjs` (every image and session check),
   `custom-dollyfile.mjs` and `source-download.mjs` (site pages), and said the catalog and
   image metadata are data; both are `.mjs` modules the page and the Worker `import()`
   (`images.mjs`, `packaged-snapshot.mjs`, `site.mjs`). Fix: the table lists them and says the
   embedding trusts the image directory it names as it trusts the runtime. Pinned document:
   `Dollyfile-dolly-docs` repinned, which restales `dolly-docs` and what is built on it.
   `host/README.md` said both sides of a provider receive the page's resources; the Worker's
   receives `runtimeBase` (and `abi`). `core/audit-host` (agent D) rewrites that paragraph
   correctly, so it is left to that branch.
8. **Two loops read a pack** (`streamPackagedSystemSnapshot`, `loadPackagedSystemSnapshot`),
   each with its reader, bounds, digest check and cancellation. Left: `demo/lean-2`
   (`ac9502fa`, agent E) rewrites `loadPackagedSystemSnapshot` to merge packs as they are read,
   with a reader of its own (`chunksOf`) that both use. That rewrite still has a branch for
   metadata that is not `"packs"`, which finding 1 makes unreachable: drop it at the merge.
9. **Seven lookups of the catalog by name, spelled out.**
   `DOLLY_IMAGES.find(candidate => candidate.image === image)` in `browser.mjs`, `site.mjs`
   (three), `runtime-worker.mjs`, `build-worker.mjs`, `image-builder.mjs` (two),
   `image-build.mjs`. Fix: `imageDefinition(name)` in `images.mjs`. `packaged-snapshot.mjs`
   keeps its own `definitionOf` until E's rewrite of it is merged. `worker-image.mjs` stops
   exporting `runtimeBase`, which only it reads.
10. **A boot waited one round trip per recipe and per metadata module.**
    `loadPackagedSnapshotMetadata` imported the metadata of each image the booted one is built
    from in a depth-first walk, one `await` at a time, then fetched each of the image's
    recipes one at a time (`cache: "no-store"`) to check that the directory serves the
    recipes that built it. Measured in Chrome with a 100 ms round trip emulated
    (`build/audit-runtime-evidence/boot-latency*.log`, three boots each, the same within
    0.15 s): `default` 9.09 s to ready, of which 17 metadata imports over 1.67 s and 17 recipe
    fetches over 1.65 s; `pi-minimal` 16.77 s, 42 metadata over 4.37 s and 42 recipes over
    4.23 s. Fix: the closure of inputs is computed from the catalog first (refusing a cycle,
    as the walk did), then every metadata module and every recipe is fetched at once and
    checked in dependency order; the recipes may come from the HTTP cache, since a version's
    files never change and the dev and release servers send `no-store` themselves. After:
    `default` 6.15 s, `pi-minimal` 9.55 s (-32 %, -43 %). What remains sequential is the packs
    (`pi-minimal`: 35 over 4.2 s), one fetch after another so that the kernel takes them in
    order; prefetching the next pack while one streams would overlap them, in the code
    `demo/lean-2` rewrites, so it is left for after that merge.
11. **A custom image over 512 MiB could not open.** `customSessionIdentity` bounded the
    custom image a session is saved on by the session delta's limit (512 MiB), and snapshot@0
    asks it for every custom image as the image starts: a custom image `FROM system` with
    400 MiB more (583 MB) built, then failed with "invalid custom session base". Catalog
    images reach 1.8 GiB (`zero-ad`, `dollyfile-studio`, `pi-local`), so a custom image on
    one of them never opened. The session test asserted the wrong bound. Fix: the base is
    bounded as an image (`MAX_SNAPSHOT_BYTES`); a source test that failed before. The repro
    (`build/audit-runtime-evidence/repro/`) builds, boots, saves and restores that image in
    Chromium and Firefox after the fix (`febec515`).
12. **A custom route fetched the recipe graph only for the host requirements it already had.**
    `loadImageHostRequirements` walked the custom recipe's whole graph (one fetch per recipe,
    in sequence) to read its root's `REQUIRES HOST` lines, which `inspectDollyfile` of the
    text `site.mjs` already holds gives: nothing is inherited from what an image is built
    from. On `/custom/run/` and a custom session that walk was the route's only use of the
    graph; on `/custom/rebuild/` `prepareImageArtifacts` walked it again. Fix: the route reads
    the recipe's own lines; the build's walk still validates the graph before any artifact
    is loaded. Measured on `/custom/rebuild/` (a recipe `FROM system`, 100 ms round trip,
    Chrome): 134 recipe requests and 18.0 s to ready before, 116 and 15.3 s after.
    Of the 116, the page asks for each recipe of `system`'s closure at most twice (the graph
    and the visible-recipe check); the rest is the Dollyfile engine, whose `execute_recipe`
    fetches a recipe through http@0 each time it parses one (`Dollyfile-system-build` 19
    times): agent C's engine, reported to the integrator.
13. **Every save on a custom image read the whole image back from the cache.** Before a save,
    `verifyBase` checks that the custom image the session restores onto is still in this
    browser's image cache; it did so with `loadCustomImage`, which reads the payload Blob,
    decodes the snapshot and hashes it, in the page, at each save. The sessions page asks the
    same question of the cache's record alone (`loadImageArtifactDescriptor`), and restoring
    checks the bytes anyway. Fix: one `customImageCached(artifact)` in `custom-image.mjs`
    for both. Measured on the 583 MB custom image of finding 11, three saves each in Chrome:
    3.42 to 3.65 s before, 2.76 to 2.85 s after, and no copy of the image in the page's heap.
14. **The rule for which image has a page of its own was spelled three times** (an image opens
    when it has ENTRY and `display@0`): `image-menu.mjs`'s menu row, `generate-routes.mjs`
    (from the graph's root, which is the recipe's own list) and `serve-checkout.mjs`. Fix:
    `opens(recipe)` in `image-menu.mjs`, beside `pageRoutes`; for all 186 recipes and catalog
    records it gives what the three did (50 open).

## Checked and left

- **The rest of a boot at a 100 ms round trip is the module graph.** After finding 10,
  `default` boots in 6.0 s: the page's and the Worker's module imports run from 0.12 s to
  4.25 s (147 `src`/`host` requests, 38 manifests; `site.mjs` is 9 imports deep,
  `runtime-worker.mjs` 7, and the providers the registry imports after their manifests up
  to 7 more), then metadata, kernel and packs (`boot-timeline-before.log`). Starting the
  kernel's fetch when the Worker starts and loading the catalog beside the registry moved
  the kernel from 4.90 s to 2.91 s but readiness only from 6.03 s to 5.93 s (`default`) and
  not at all for `pi-minimal` (`boot-timeline-after.log`): reverted, not worth its lines.
  What would help is fewer levels or a generated `modulepreload` list; one level everywhere
  comes from `host/requirements.mjs` importing `static-asset.mjs` for `hex`, which pulls in
  `snapshot-records.mjs` and `image-names.mjs`. Served as Pages serves a version (immutable
  caching, so the Worker's imports hit the cache the page's filled), `default` is ready in
  4.4 to 4.6 s at 100 ms on a first visit; listing its 75 modules as `modulepreload` made it
  6.0 s over the local HTTP/1.1 server, which takes six requests at a time
  (`preload-experiment.log`). Not pursued: Pages' HTTP/2 would need its own measurement.

- **A custom image is described twice when it boots** (`/custom/run/`, a custom session):
  the page reads it from the image cache and checks it (`loadCustomImage`), the build Worker
  checks the bytes it is handed again (`checkedCustomArtifact`). Measured on `system`'s
  156 MiB snapshot in Node: decoding 6 to 10 ms, SHA-256 113 ms. Two trusted sides, a tenth
  of a second for a typical custom image: left.
- **`appendCustomSection` looked test-only** (three test files import it from
  `src/wasm-interface.mjs`), but `scripts/dolly-abi.mjs` stamps every executable's sections
  with it through a multi-line import a line-based grep missed; the source suite said so.
  Kept.
- **`test/pages-publication.test.mjs` matches the text of `.github/workflows/pages.yml`.**
  It is the only check of a workflow that runs on GitHub alone, and what it checks (the
  deploy verifies the digest the owner chose) is the release's authority: left.
- **The registry** (`host/modules.mjs`): every member of the context a provider gets and of
  the host `createHost` returns has a reader; boot and `nena` share one attach/detach path, as
  decided on 2026-10-23. No change.

## Merging

A trial merge with `demo/lean-2` (`git merge-tree`, 18:20) conflicts in
`src/packaged-snapshot.mjs` and `host/packages/service.mjs` beside the recipe pins every
branch's docs repin touches (`node scripts/update-recipe-pins.mjs` after the merge settles
those): take lean-2's pack loader, without its branch for metadata that is not `"packs"` and
without the loaders' `image` argument (finding 1), and keep this branch's metadata loader
(finding 10), which lean-2 does not change. `docs/browser-boundary.md` and
`scripts/build-snapshot-browser.mjs` merge cleanly. `core/audit-host` rewrites the
`host/README.md` paragraph finding 7 would have fixed, so this branch leaves it.

## For the owner

- **An image directory could be data.** Because the catalog and metadata are modules, a page
  runs the JavaScript of any image directory it boots, and the release verifier parses them
  with `parseGeneratedConstant` ("Generated metadata is data, not executable input to the
  release verifier"), a parser for JSON wrapped in `export const X = Object.freeze(…)`. As
  `dist/dolly-images.json` and `dist/dolly-IMAGE-system-snapshot.json`, read with
  `import(url, { with: { type: "json" } })` as the host manifests already are, an embedding
  could boot an image directory it does not trust (its programs are untrusted anyway), and
  the parser goes. Cost: the writers (`image-definitions.mjs`, `build-system-snapshot.mjs`,
  `share-pages-snapshots.mjs`), 5 page modules, 10 scripts, 16 tests and 9 demo tests name
  the files; `dist/` converts without a rebuild; the npm image packages change layout, so it
  belongs to a version (0.1.5), not a patch. Not done tonight: it touches the other agents'
  demo tests.
- **Should a boot check the recipes the directory serves?** `loadPackagedSnapshotMetadata`
  fetches every recipe of the booted image's closure (17 for `default`, 42 for `pi-minimal`)
  and compares them with the catalog, so that what `/view/IMAGE/` shows is what built the
  image. A boot uses none of them, builds check their pins in the engine, and the check is
  why every npm image package ships its recipes. After finding 10 it costs one round trip.
  Keep it (as now), or check recipes only where they are read (views, rebuilds).
- **`boot()` has no end.** The handle has no way to stop the session: an embedding that
  removes Dolly's element keeps the runtime Worker, the kernel's memory and every process
  Worker until the page is hidden (`pagehide`). The page already has the step (`fatal()` and
  `ended()` dispose the modules and terminate the Worker); a handle member `end()` would be
  about five lines and a row in `docs/embedding.md`. No embedding has asked for it, so it is
  not added.

## Lessons

- A reader outlives its writer unless the commit that retires the writer removes it. The raw
  and gzip snapshot readers lasted five weeks after every image was packed, the uncompressed
  session reader four, and per-version session databases had made it unreachable the day
  0.1.0 shipped. "Nothing writes this" is checkable: the writers' code and the 215 metadata
  files of `dist/`.
- On localhost every boot looks instant; with a 100 ms round trip emulated, one `await` per
  recipe and per metadata module was a third of `default`'s boot and over two fifths of
  `pi-minimal`'s. The code read clean; only a request timeline showed it. Every `await` in a
  loop over network resources deserves that measurement.
- A line-based grep is not a call graph: it called `appendCustomSection` test-only, and a
  multi-line import in `scripts/dolly-abi.mjs` uses it. Deleting and running the 30 s source
  suite settles "unused"; grep only nominates.
- Look at the other branches' diffs of your files before refactoring shared code (`git diff
  --name-only main...BRANCH`): agent E had rewritten the pack loader I was about to fold, and
  a browser batch was lost to it.
- The tree came without generated pages, and `generate-routes.mjs` cannot run in it: its
  `dist/` is the integration tree's, whose demo sources are ahead of `main`'s pins. Writing
  the route pages from the catalog in `dist/` with the same template works; editing served
  files while a browser batch runs does not (one batch lost).
