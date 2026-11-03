# The page keeps the runtime and an image's packs in the browser, so a start reloads nothing

- STATUS: CLOSED
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

## After (2026-11-03 21:16, same browsers)

- With the HTTP cache bypassed (Playwright's routing, `route-system.log`), `system`'s second and
  third starts downloaded no pack in Chrome or Firefox, where Chrome had downloaded all 20 at
  every start; the start took the same time (1.9 to 2.2 s from a local server).
  `navigator.storage.estimate()` grew by the packs: 41.0 MiB (Chrome), 41.4 MiB (Firefox).
- `test/pack-store-browser.mjs` (Chrome 2.6 s, Firefox 4.0 s) serves packs itself, uncacheable,
  and counts them: a second start of `default` downloads none and removes another runtime's
  record and pack and a pack no record names; a session saved there opens while the server
  refuses every pack; a kept pack overwritten with other bytes of its length fails the start and
  is removed, and the next start downloads that one pack; the sessions page's Clear empties the
  store, and the next start downloads every pack. In Firefox, with
  `permissions.default.persistent-storage` = 1, a save leaves the origin's storage persisted.
- Over a slow link (`slow-system.log`: `system`'s packs served uncacheable at 5 MiB/s, the
  page's other files local): before, every start took 9.3 to 9.8 s; after, the first 9.6 s
  (Chrome) and 10.0 s (Firefox), the second 2.3 s and 2.1 s, downloading no pack. Writing the
  store costs the first start about 0.2 s here.
- `boot({ session })` on a page of one's own (`own-session.log`): Save named the session
  `?session=own`, and the reload opened it with every pack refused, the saved file there, in
  both browsers.
- Passed in Chrome and Firefox: `core`, `custom-session`, `session-offline`, `snapshot-stream`,
  `host-modules`, `indicators`, `image` (whose rebuild now downloads a pack two of its inputs
  hold once, not twice), the first `amy` test (packages through `packages@0`, their packs
  through the store), and `site` and `nena` once `dolly-docs`, `libdolly-audio` and
  `libdolly-microphone` were added to this tree's catalog (37 images). `amy programs` needs
  `sdl2`, which this catalog lacks.
- Not run: `test/npm-browser.mjs`. It packages `pi-minimal`, whose closure on this branch
  rebuilds the Rust toolchain (`rust-llvm`, `rust-build`: the `git` and `ghostty-build` recipes
  changed on integrate), which no build slot holds; a start of it here stopped at `rust-llvm`
  and was killed. The round after the merge runs it.

## Lessons

- Measure where the owner is, not where the code runs: on this desktop both browsers' HTTP
  caches kept every pack (600 MiB returned whole), so a second start already downloaded no
  pack; the slowness was the phone's Chrome evicting 367 MiB. The fix had to stop relying on
  the HTTP cache, and its test had to make the HTTP cache unable to help: a server that answers
  packs uncacheable. Playwright's routing is no such server: Firefox's routing does not see a
  Worker's requests, and its HTTP cache answered them.
- `navigator.locks.request` releases a lock only after its callback's promise has settled, a
  turn later: an `ifAvailable` request made right after resolving it finds the lock still held,
  and the prune never ran until the release waited for the request's own promise.
- A pack is checked by its reader as it streams, so "keep only what was checked" needs a store
  that commits after the stream: OPFS's writable (`close()` commits, `abort()` drops) does it,
  Cache Storage's `put` commits when the body ends, before the check. Packs reach 2 GB, so
  buffering one to check it first was never an option.
- Every edit of a document `dolly-docs` pins (the review map among them) repins `dolly-docs`,
  `pi-dolly` and nine demo recipes on them: a page-only change that documents itself asks for
  their rebuild in the next round.

## Closed 2026-11-03

Commits `b3faca044` (the pack store), `c0bc7e0a5`, `a92c5d21c` (docs), `83efbf4b1` (the image
test) on `core/pack-cache`; `test/pack-store-browser.mjs` in Chrome 156 and Firefox 155. The
phone was not measured: it is served from `work/phone`, which gets the store when it carries
this branch.
