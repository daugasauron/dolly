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
