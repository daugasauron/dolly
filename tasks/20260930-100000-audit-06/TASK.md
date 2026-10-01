# alarm() never delivers SIGALRM

- STATUS: OPEN
- PRIORITY: 120
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
