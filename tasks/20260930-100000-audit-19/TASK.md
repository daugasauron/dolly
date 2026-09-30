# No trusted cap on concurrent process Workers

- STATUS: OPEN
- PRIORITY: 210
- TAGS: security,boundary,core

`src/process-supervisor.mjs:417-419` creates a Worker per spawn with no limit (threads are
capped at 16 per process / 64 total in `src/host/threads.mjs:25`).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

The supervisor enforces a maximum number of live process Workers and spawn fails with EAGAIN
beyond it.

## Done when

- Browser check: a spawn loop beyond the cap gets EAGAIN and the shell stays usable.
