# system(), pclose(), waitpid(pid<=0) and alarm() misreport or no-op

- STATUS: OPEN
- PRIORITY: 210
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
