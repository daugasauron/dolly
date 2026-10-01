# Stale project documentation

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: doc

`README.md:89` says the RTS arena is not deployed (it is in both catalogs and
`index.html:111-113`); `docs/deployment.md:32,43` says Slopyard is excluded from both sites;
`docs/roadmap.md:27-28` says rg/fd are not shipped; `docs/port-status.md:11` says no threads;
`docs/rts-arena.md:6` says audio and threads are unavailable; `docs/rts-handoff.md:16,21` points
to checkouts outside the repo; `docs/slopyard-audit-20260923.md` says SIMD is disabled while
`docs/slopyard.md` says SIMD and four workers; `docs/sources.md:188-432` is 0 A.D. gameplay/test
narrative; `modules/posix-shell.dm:4` says /bin/sh is for upstream scripts while
`docs/slop.md:208` says Slop is not POSIX sh; `docs/crash-handoff.md` describes the
pre-consolidation worktree layout.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Docs describe the current system; dated handoffs live in tasks or are deleted.

## Done when

- Each listed statement corrected or removed.

## Resolution (2026-10-01)

Rechecked on `next`: `docs/` holds only the 13 current references
(architecture … sources); roadmap, port-status, rts-arena, rts-handoff,
crash-handoff and the Slopyard audit are gone; `docs/sources.md` is 75 lines
and names 0 A.D. only as a demo exception; `docs/deployment.md` no longer
mentions Slopyard; no README under `demos/` repeats the listed claims; and
`modules/posix-shell.dm` says `/bin/sh` is a conventional path whose
implementation is Slop, consistent with `docs/slop.md`.
