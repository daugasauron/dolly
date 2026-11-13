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

## State (2026-11-14)

Done on `fix/sessions` (from main `e6ad7707c`), in headed and headless Chrome 138 and Playwright's
Firefox; open until the branch is merged and its images rebuilt. Scenario scripts and logs:
`build/audit/` and `build/sessions-tests/` of the worktree `work/sessions`.

Fixed, each with a test that fails without it:

| What a user met | Cause | Commit, test |
| --- | --- | --- |
| A session holding a file over 2 GiB saved, and then never opened ("filesystem restore failed") | the restore bounded a record by an image's 2 GiB, the save by 8 GiB | `1aa5f7ec6`, `session-large-file-browser` |
| A session open in two tabs: each tab's save replaced the other's without a word | a save by the tab's own name never looked at what was stored | `f8af7f699`, `session-save-browser` |
| Every save of a candidate became "Older runtime" with Recover files only after any kernel change | a save was bound to the runtime build, not to what its programs need | `313d576d5`, `session-save-browser`, `tasks/20261113-140107-runtime-orphans` |
| Export of a save over 2 GiB stored: no file in Chrome ("could not be read, typically due to permission problems"); in Firefox a buffer of the wrong length | the checksum read the save into one buffer | `0c111c7f5`, `session-file.test` |
| Storage full in Chrome: "Save failed: " and nothing after it | Chrome's quota error has no text | `f8af7f699`, `session-save-browser` |
| More than 1,000,000 paths: "capture failed with status -1" | E2BIG was not named | `45f707268`, `session-transport.test` |
| A session file with damaged metadata: the text decoder's own message | uncaught | `f8af7f699` |
| No way to rename a save | none existed | `a1f3585e3`, `session-save-browser` |
| A running page's fetches stalled 20 s and more in Firefox once a service worker claimed it | `clients.claim()` on a page whose Workers wait in `Atomics.wait` | `2603f4835` (the worker claims nothing) |

Restore from local storage (`2603f4835`, `e93e4c5de`, `42284c948`; `docs/sessions.md`,
`docs/browser-boundary.md` in `0ef07a157`): a save or an import keeps the site's runtime, the 182
files of `dist/dolly-offline.json` (3.5 MB: the session and sessions pages, page and Worker code,
host modules, kernel; no image, no compiler seed), in Cache Storage, each checked against the
list's SHA-256; the site's service worker answers from it only when a request fails.
`test/session-offline-browser.mjs` saves, has the server answer nothing and opens the session,
its page included, for a catalog image and a page-built one, in Chromium and Firefox. By hand
(`build/audit/offline-user-*.log`, under `/v0.1.6/` with the release server's ETag and
`no-cache`, the server stopped): reload, the sessions page, the same after quitting and starting
the browser, and a save made offline all work in both; the menu and image routes do not load,
being no part of a save.

Held under test (no change needed): the filesystem round trip (names with spaces, quotes,
newlines, invalid UTF-8, 255 bytes; symlinks, dangling too; empty directories; deletions of image
files; times from 1970 to 2038; 300 MB files; 300,000 files save in 3.3 s and restore in 1.8 s);
a save while a program appends (its writes wait, the file is whole); two saves at once (one
save); a tab closed mid-save and a quota failure (the previous save opens); a reload at three
moments of a restore; modules enabled with `nena` (enabled again); a private window in both
browsers; a truncated, damaged, other-version or foreign file on import (refused, or imported and
refused at restore); a damaged stored save (the boot fails, nothing is half restored).

Left: `20261113-140028-recover-large` (Recover files over 2 GiB, a seed change),
`20261113-140107-unsaved-leave` (a reload loses unsaved changes without a word; the owner's
choice), `20261113-140107-unverified-cases` (a hidden tab's save, Firefox's storage prompt).
`0ef07a157` changes two documents of the docs package: `dolly-docs` and the twelve images that
install it need a rebuild.

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
