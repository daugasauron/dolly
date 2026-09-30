# Browser boundary documentation drift

- STATUS: CLOSED
- PRIORITY: 110
- TAGS: doc,boundary

`docs/security.md:49` claims no guest storage API (build service writes IndexedDB).
`docs/browser-boundary.md:198-210` omits that the build service comes with every http@0 image
and that same-origin/loopback/LAN are reachable. `docs/download.md:43-44` says generated glue
validates downloads (validation is hand-written in `src/host/download.mjs:36-48`).
`docs/http-concurrency-work.md` (176 lines) is an unlinked handoff pointing to a private
worktree and uncommitted changes.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

The review map lists every authority and its bounds as implemented.

## Done when

- Docs updated with the boundary fixes; stale handoff notes removed.

## Result (2026-10-01)

`docs/security.md`, `docs/download.md` and `docs/http-concurrency-work.md` are
gone (`d8fa8c4`, `0ff7e26`); `docs/browser-boundary.md` lists the IndexedDB
cache, the `build@0` build admission and loopback/LAN reachability.
