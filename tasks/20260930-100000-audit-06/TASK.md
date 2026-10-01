# alarm() never delivers SIGALRM

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: bug,core,compatibility

`system()` and `pclose()` return `status<<8` (`src/process/runtime-adapter.c:881`, `:982`), so a
signal-killed child looks like a normal exit. `waitpid(pid<=0)` returns ECHILD (`:517`).
`dolly_alarm` does nothing and returns 0 (`:552`).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Wait-status encoding matches POSIX (WIFSIGNALED works); `waitpid(-1/0)` waits for any child (or
fails explicitly with a documented errno); `alarm()` either works or fails explicitly.

## Done when

- C probes in the browser: `system("kill -TERM $$")`-style child reports WIFSIGNALED;
  `waitpid(-1, ...)` reaps a child; `alarm(1)` delivers SIGALRM or returns an explicit error.

## Recheck (2026-10-01, `work/fixes-build`)

- Fixed in `26277ef`: `system()` and `pclose()` return the wait status from
  `dolly_waitpid`, and `waitpid(-1|0)` waits for any child.
  `process-lifecycle.c` now checks `waitpid(-1)` reaping a child and
  `system("exit 3")` giving `WIFEXITED` with 3, in Chrome and Firefox.
- Left: `alarm(1)` returns 0 with `errno` = `ENOTSUP` (musl's setitimer
  path) and never delivers SIGALRM. alarm() has no error return, so an honest
  result needs either a kernel timer that raises SIGALRM at the next
  checkpoint, or no `alarm` symbol so configure scripts select their fallbacks.
  That choice is the owner's.

## Decision (2026-10-01, delegated by the owner)

Implement `ITIMER_REAL`; do not remove the symbols.
- Git's `upload-pack.c` and `daemon.c` call `alarm()` unconditionally, and Git
  has no knob to omit it (`NO_SETITIMER` covers only `progress.c`'s
  `setitimer`). Removing `alarm` would force a Git source patch, against
  "unchanged upstream source plus toolchain configuration".
- Today's `alarm(n)` silently never fires: an unimplemented operation
  reporting success.
- The kernel already keeps per-process deadlines (`dolly_spawn_timeout`,
  used by `timeout`), so a timer that raises SIGALRM at a deadline reuses
  existing machinery instead of adding a subsystem.

Semantics: `alarm` and `setitimer(ITIMER_REAL)` (with `it_interval`, which
Git's progress display uses) raise SIGALRM at the deadline. The default
action terminates the process; a handler runs at the next system call, and a
blocking wait returns `EINTR` unless `SA_RESTART`. `ITIMER_VIRTUAL` and
`ITIMER_PROF` fail with `EINVAL`.

## Result (2026-10-01, `work/alarm`)

`alarm`, `ualarm`, `setitimer` and `getitimer` drive one per-process
`ITIMER_REAL` timer in the kernel (process operations `ALARM` and
`ALARM_HANDLED`); `ITIMER_VIRTUAL` and `ITIMER_PROF` fail with `EINVAL`.
The supervisor's 16 ms service tick asks the kernel for due timers. A
default-action SIGALRM is delivered like `kill`: it wakes a blocking call with
`EINTR` and the 500 ms interrupt grace ends a process that makes no system
call. libc reports through `sigaction` while SIGALRM is handled or ignored; the
signal then only becomes pending, never forces termination and does not change
a normal exit status. `sleep` now returns the unslept seconds.

`test/fixtures/process-signals.c` passes in Chrome and Firefox
(`test/process-browser.mjs`): `alarm(1)` with
the default action ends a sleeping child and a spinning child with
`WIFSIGNALED`/`SIGALRM`; a child that spins about 1.5 s with a handled 50 ms
interval timer exits 0 (the uninterrupted spin measured 0.72-1.0 s per ten
calibration periods in both browsers, so it outlasts the grace); a handler
interrupts a blocking pipe `read` with `EINTR` and `sleep(3)` returns 2 after
`alarm(1)`; a 50 ms interval fires at least three times; `alarm(0)` after
`alarm(5)` returns 5 and disarms; `ITIMER_VIRTUAL`/`ITIMER_PROF` give `EINVAL`.
The core, process, slop, shell, boundary and terminal browser tests pass in
both browsers on the rebuilt `default` image; `npm run test:source` passes.

