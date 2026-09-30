# CPython signal.pause and termios are silent approximations

- STATUS: OPEN
- PRIORITY: 130
- TAGS: bug,demo,python,compatibility

`signal.pause()` returns immediately; termios drops ISIG, IXON, VMIN and VTIME
(`src/runtimes/cpython-*.c`).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Blocking until a signal, or an explicit error; termios reports unsupported flags.

## Done when

- Python image tests for `signal.pause()` with an alarm/interrupt and termios round trips.
