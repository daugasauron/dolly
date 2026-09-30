# Threaded process exit can report a false Worker failure

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: bug,core,kernel,lifecycle

EXIT marks the process exited and clears its thread records (`src/process-kernel.c:2326-2351`),
but the supervisor retires the process only when the exiting Worker later posts `finished`
(`src/process-supervisor.mjs:619-621`). A `thread-finished` in that window makes
`_dolly_threads_retired` return -ESRCH (`:2388`) and `#fail` runs (`:616`): a false "Worker
failed" message, and a root process rejects instead of reporting its status (`:672-682`).

## Evidence

Established: SUSPECTED. Race identified by reading; not reproduced.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Thread completion after process EXIT is ignored or accounted without failing the process.

## Done when

- A browser check with a threaded program that exits while threads are finishing never reports a
  Worker failure and returns the real exit status (repeat enough times to exercise the race).

## Result (2026-10-01)

Process `EXIT` from any thread disposes the other threads' Workers and their
message handlers before a late `thread-finished` can reach the kernel
(`26277ef`). `test/threads-browser.mjs` now runs a program whose eight threads
finish while `main` calls `exit(37)`, ten times; every run reports 37 with no
Worker failure, in Chrome and Firefox.
