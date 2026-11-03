# The page keeps the runtime and an image's packs in the browser, so a start reloads nothing

- STATUS: OPEN
- PRIORITY: 340
- TAGS: browser,images,snapshots,performance,sessions

Owner (2026-11-03): "the "whole runtime" should be cached in localstorage on save, so the runtime
image doesn't have to get redownloaded. Currently it is very slow and annoying to redownload images
each time you want to start then, and I think if a session is saved it should be possible to cache
"everything" in localstorage to make it fast?"

Measured the same day: each open of pi-phone on the owner's phone downloaded its image again
(367 MiB over USB from a local server, slower over a phone's network); a saved session restores
its delta over the published image, so opening a session fetches the image's packs too. Packs
are fetched with `cache: "force-cache"` (`src/packaged-snapshot.mjs`), which leaves them to the
browser's HTTP cache: it evicts what it likes and caps one entry's size. Images built in a tab
are kept in origin-private storage (`src/image-artifact.mjs`); sessions in IndexedDB
(`src/session-store.mjs`).

`localStorage` holds about 5 MB; what holds hundreds of MB is origin-private storage or Cache
Storage, with `navigator.storage.persist()` asking the browser not to evict it. AGENTS.md allows
it for what is immutable: "A browser cache may hold immutable distribution bytes; it must not
become the mutable guest filesystem." Packs are named by their SHA-256 and the runtime's files by
the build's identity, so both qualify; a session's delta stays where sessions are.

Done when: a second start of an image, and the opening of a saved session, read the runtime and
every pack from the browser's own storage and fetch nothing large (measured in Chromium and
Firefox, and on the owner's phone if it is connected), every cached byte is checked against its
digest before use, packs no image uses any more are removed (the page's storage does not grow
with each release), what the page holds is shown and can be cleared (the sessions page or the
page's own control), and the boundary review (`docs/browser-boundary.md`) says what is stored.

## What a second start fetched before (2026-11-03 21:06, Chrome 156 and Firefox 155)

Measured on this branch's `default` and `system` from `scripts/serve-checkout.mjs`, the server
`work/phone` runs for the phone (packs `immutable`, every other file `no-store`), in a persistent
profile of each browser, three starts one after another
(`build/cache-evidence/before-*.log`):

| | Start 1 | Starts 2 and 3 |
| --- | --- | --- |
| `default` packs | 4, 5.0 MiB | none: the HTTP cache |
| `system` packs | 20, 41.0 MiB | none: the HTTP cache |
| Every other file | 128 to 156 requests, 3.0 MiB | the same, again |

The other 3.0 MiB is what the dev server sends `no-store`: the font (1.0 MiB), the catalog twice
(the page's and the Worker's import, 285 KiB), `dolly.wasm` (219 KiB), the metadata of every
image in the started image's input closure (`ghostty-build` 161 KiB, `zig-build` 158 KiB, about
1.2 MiB together) and the page's modules. With every file `immutable`, as slopshare.dev sends
them, a second start made 4 requests of 14 KiB: the files the code fetches with
`cache: "no-store"` (the process Worker's bundle and three interface modules).

So the browsers' HTTP caches already kept the packs here: on this desktop each returned all of
600 MiB of 4 MiB immutable files on a second pass (`httpcache-600.log`). The phone's Chrome did
not keep pi-phone's 367 MiB. The HTTP cache is the browser's: Chrome sizes it from free disk and
evicts as it likes, and a reload that bypasses it (DevTools, Playwright's routing) downloads every
pack. With routing (`route-system.log`), Chrome downloaded all 20 packs at every start; Firefox's
routing does not reach a Worker's requests, and its HTTP cache answered them.

## Design

`src/pack-store.mjs`, used by `packagedSnapshotParts` (`src/packaged-snapshot.mjs`), which every
reader of an image's packs goes through: a start (`runtime-worker.mjs`, so `/session/` and
`boot({ session })` too), `packages@0` and the site's builds.

- Origin-private storage, directory `dolly-packs`: `packs/SHA256`, one file per pack, shared by
  every image, image directory and version on the origin. The bytes are written as they stream
  to the reader; the writable commits on `close()`, called by the reader's `verified()` once the
  part matched its digest, and `abort()` drops it otherwise. Packs reach 2 GB (one large file),
  so nothing buffers a pack. Cache Storage would commit when the body ends, before the check.
- A kept pack goes through the same checks a download does (the kernel's per-part hash and the
  image's hash when booting, SHA-256 per pack when merging), so it is checked at every use and
  costs no second decompression. One that fails is removed: that start fails, the next downloads it.
- `images/HASH`: each image read records its directory, name, image build ID and packs. When no
  image is being read on the origin (a shared Web Lock per reader, an exclusive one with
  `ifAvailable` to prune), the records of another runtime's images and of images this
  directory's catalog no longer has go, then every pack no record names. A rebuilt image keeps
  its former packs until it is read again. Two versions on one origin with different seeds remove
  each other's packs; each then downloads its own once more.
- A save calls `navigator.storage.persist()` and does not wait: headless Chrome answered `false`,
  with or without a click (it decides from the site's engagement), and Firefox showed its prompt,
  the promise pending until answered (`persist.log`). Not at a start: Firefox would prompt every
  visitor. Without persistence the store is best-effort storage, evicted under storage pressure,
  as the saves are.
- The sessions page shows the store's size and whether the browser keeps it, and clears it.
- Not stored: the runtime's own files. They are 3.0 MiB of small files that the HTTP cache keeps
  where they are cacheable (the site); only a service worker could serve the page's modules from
  a store. `dist/dolly.data` (116 MB) is read only by a root build, not by a start or a session.
