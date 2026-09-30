# Process syscall sequence counter overflows after 2^31 calls

- STATUS: OPEN
- PRIORITY: 220
- TAGS: bug,core,kernel

`src/process-worker.mjs:508` computes `(Atomics.add(control, 0, 1) + 1) | 0`, which becomes
negative after 2^31 calls on one thread. The supervisor rejects negative values
(`src/process-supervisor.mjs:491`) and kills the process with status 126. Long-lived shells and
agent runtimes can reach this.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Sequence numbers wrap safely (or use a comparison that tolerates wrap) without killing the
process.

## Done when

- A unit or browser check drives the worker/supervisor sequence across the 2^31 boundary (e.g.
  by seeding the control word) and the process keeps running.

## Progress (2026-10-01)

Fixed in `26277ef`: `src/process-worker.mjs` wraps the sequence from
2^31 - 1 back to 1, so it never goes negative. Still missing the check that
drives a thread across the boundary.
