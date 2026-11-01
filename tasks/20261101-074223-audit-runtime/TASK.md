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

## State (2026-11-01 17:30 JST)

Read every file of the scope and the audit of 2026-10-23 (`tasks/20261023-200000-core-audit`),
whose findings are all on `main`. Findings 1 to 5 are committed (`08733fc1`, `8e322019`,
`3d6ec732`, `4c180e49`), verified by the source suite and, in Chromium and Firefox, the
snapshot stream, image, custom session, session offline, core, site, ending and host compute
suites (`build/audit-runtime-evidence/run2.log`). Next: finding 6.

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

## Lessons
