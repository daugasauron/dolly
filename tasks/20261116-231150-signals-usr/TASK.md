# SIGUSR1 and SIGUSR2 are not among the kernel's signals: one sent to another process never arrives

- STATUS: OPEN
- PRIORITY: 180
- TAGS: bug,process,signals,kernel,0.1.8

Found by the Python fix of 2026-11-17 (`work/audit-1116-evidence/ports/fix-python/`,
`chromium-signal/packaged-interprocess.log`): CPython's `test_interprocess_signal` waits until its
two-minute timeout, with 0.1.7's python as with the rebuilt one.

## State (2026-11-17)

Changed on `ws/seed`; the seed changes with it (the process contract): checked in a rebuilt
`system` (below). What only the 0.1.8 compiler round can confirm is in the report of the seed
workstream and in Done when.

## Found

The kernel numbers ten signals (`include/dolly/process.h`, `DOLLY_PROCESS_SIGNAL_MASK`: HUP, INT,
QUIT, ABRT, KILL, PIPE, ALRM, TERM, CHLD, WINCH). `kill(PID, SIGUSR1)` of another process is
refused with `ENOTSUP` (`kernel/process-kernel.c`, `supported_signal`), and a `raise(SIGUSR1)`
with no handler fails rather than ending the process (`process/signal.c`, `deliver_pending`).
`test_interprocess_signal` (`Lib/test/signalinterproctester.py`) installs handlers for SIGHUP,
SIGUSR1, SIGUSR2 and SIGALRM and has a child `os.kill` its parent with each: the child's SIGUSR1
fails, and the parent waits in `signal.pause()` for a signal that never comes. Programs use the
two for "reload", "dump state" and between their own processes (daemons, test harnesses, `dd`).

## Done

- `include/dolly/process.h`: `DOLLY_PROCESS_SIGUSR1 = 10`, `DOLLY_PROCESS_SIGUSR2 = 12`, in
  `DOLLY_PROCESS_SIGNAL_MASK`; their default is to end the process, as the other non-notification
  signals do (the kernel's `notification_signals` is unchanged). The contract only adds accepted
  values: no operation or layout changes, so the round starts with `restamp-seed-compiler.mjs`
  (`docs/sources.md`).
- `process/signal.c`'s static assertion; slop's `trap` takes `USR1` and `USR2` (`programs/slop.c`,
  `docs/slop.md`); `docs/process-model.md` lists them.
- `test/fixtures/process-signals.c` sends each of SIGINT, SIGTERM, SIGUSR1 and SIGUSR2 to a child
  in every mode (handled, re-raised, exit in the handler, a handler that never returns, restart,
  ignored, a clock loop).

## Done when

`process-browser` passes in Chromium and Firefox on the rebuilt seed with the four signals, and
python's `test_signal` with `test_interprocess_signal` passes in the round's python.
