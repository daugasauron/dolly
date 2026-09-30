# Writing to a pipe with no reader never raises SIGPIPE

- STATUS: CLOSED
- PRIORITY: 220
- TAGS: bug,core,kernel,compatibility

`src/process-kernel.c:1085` returns -EPIPE but never raises SIGPIPE, so `producer | head`
pipelines print write errors instead of exiting quietly.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

A write to a widowed pipe delivers SIGPIPE (default action: terminate) and returns EPIPE when
SIGPIPE is ignored or handled.

## Done when

- Browser check: `yes | head -n 1` (or an equivalent bounded producer) prints one line and no
  error; a C program ignoring SIGPIPE sees EPIPE.

## Resolution (2026-09-30)

By design. Slop pipelines are serial, so no producer writes into a pipe whose reader has exited; writes without a reader fail with EPIPE (restored in fix/kernel2, aa4e312).
