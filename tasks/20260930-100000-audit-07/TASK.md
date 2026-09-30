# Supervisor launch robustness: deadlines, compile order and one failure killing all

- STATUS: CLOSED
- PRIORITY: 180
- TAGS: bug,core,lifecycle

The kernel accepts any spawn deadline (`src/process-kernel.c:620`) while the supervisor treats
more than 24 h as a kernel error and kills the child with 126
(`src/process-supervisor.mjs:451-457`); libc caps it (`runtime-adapter.c:45`) but raw ABI
callers do not. Any exception in the launch chain fails every process including the shell
(`:292-296`). `WebAssembly.compile` runs before the cheap interface validation (`:327-328`).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

The kernel validates deadlines at the ABI; launch failures are isolated to the process being
launched; cheap validation precedes compilation.

## Done when

- A raw-ABI spawn with an out-of-range deadline fails with EINVAL and leaves the parent running.
- An invalid executable fails only that spawn (existing 126 fixtures) without affecting the
  shell.

## Progress (2026-10-01)

Deadlines more than a day away return `EINVAL` from the kernel; each launch
has its own error handling and ABI checks run before compilation (`26277ef`).
The 126 fixtures in `test/core-browser.mjs` cover invalid executables.
Missing: a raw-ABI spawn with an out-of-range deadline.

## Result (2026-10-01)

`test/fixtures/process-lifecycle.c` now spawns with a deadline two days away
through `dolly_spawn_timeout` and gets `EINVAL` from the kernel's
`valid_spawn_deadline`, then keeps running; the 126 fixtures in
`test/core-browser.mjs` cover invalid executables. `test/process-browser.mjs`
passes in Chrome and Firefox.
