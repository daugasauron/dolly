# CPython signal.pause and termios are silent approximations

- STATUS: CLOSED
- PRIORITY: 130
- TAGS: bug,demo,python,compatibility

`signal.pause()` returns immediately; termios drops ISIG, IXON, VMIN and VTIME
(`src/runtimes/cpython-*.c`). ISIG round-trips since the termios ISIG model
([slop-loop-interrupt](../20261001-000500-slop-loop-interrupt/TASK.md)).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Blocking until a signal, or an explicit error; termios reports unsupported flags.

## Done when

- Python image tests for `signal.pause()` with an alarm/interrupt and termios round trips.

## Closed (2026-10-02)

Fixed on `fix/python-fixes` (`pause()` in the libc, alarm/setitimer enabled, one honest termios in the core) and merged.

Verified on the integration branch `work/dollyfile-v6` (`0d54a87`), release
`fcb204c0…`: 51 images rebuilt from scratch (image inputs `9f7a44a7…`),
artifacts 20/20, source 334/334, every browser suite in Chrome and Firefox,
image-inventory acceptance for every application and toolchain, and the demo
tests for python, javascript, emacs (Chrome and Firefox), pi, neovim, rust,
cmake, sdl2, studio, codex, bhop, classicube and rts in Chrome.
