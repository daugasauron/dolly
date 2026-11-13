# Save, resume and snapshots: an audit with user testing, and restore from local storage

- STATUS: OPEN
- PRIORITY: 430
- TAGS: snapshot,sessions,audit,offline,0.1.6,owner,overnight

Owner (2026-11-13): "I want to do a thorough audit using fable5.2 on the save/resume/snapshot
functionality. I feel it's a bit buggy but not really sure. Ideally, after a session is saved,
it should be possible to restore the session (the complete runtime + the state of the in memory
file system) offline - completely from local storage." Then: the page's own request
(`?session=NAME`) may reach the server; running programs' memory and process state are not
part of a save; and the audit includes "user testing" of corner cases, so that actual users
do not run into issues.

## Found before the audit (2026-11-13)

- `test/session-offline-browser.mjs` is not offline: it tests a session of an image without
  `http@0`, restored from the live server.
- The release server sends every file `no-cache` with an ETag: each load revalidates, so
  nothing loads without the server. The only service worker, `coi-serviceworker.js`, adds the
  isolation headers and caches nothing.
- A session restores only on its own version (its build ID); offline means that version's files
  are held locally. The save asks for persistent storage (`host/snapshot/ui.mjs`); without it the
  browser may clear saves and caches.

## Do

1. Audit, with Fable 5.2: snapshot@0 (`host/snapshot/*`, its contract), `src/session-store.mjs`,
   `session-file.mjs`, `sessions.mjs`, the kernel's `system-snapshot.c` and `session-records.h`,
   the pack store and the route's boot path. Measure, not only read.
2. User testing, in real browsers as a person uses them (headed Chrome and Firefox; the owner's
   display `:1` is allowed overnight on 2026-11-13): save and reload; save while a program writes;
   large files, many files, deletions, symlinks, times; two tabs on one session; rename, delete,
   export and import; a corrupted or other-version session file; storage full; a tab closed
   mid-save; custom-image sessions; modules a session enabled with nena; a private window; the
   sessions page throughout. Note every surprise a user would meet, with its repro.
3. Restore from local storage: after the page's request, the runtime and the filesystem come
   from the browser. A versioned cache of the release's immutable files that a saved session
   needs, filled when it is saved, answered by a service worker scoped to the version when the
   network fails; and a test that saves, cuts the network (or stops the server), reloads
   `?session=NAME` and finds the files and the image's entry running. Whether the page itself can
   also load offline is reported.

## Done when

The findings are tasks with repros, the confirmed bugs are fixed with tests, and the offline test
passes in Chromium and Firefox.
