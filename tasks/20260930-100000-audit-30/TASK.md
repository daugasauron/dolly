# Slop descriptor, flag, case and argument-limit defects

- STATUS: OPEN
- PRIORITY: 230
- TAGS: bug,slop,core

Confirmed by reading: fds 3-9 never reach children because `dolly_spawn` maps only 0-2
(`src/slop.c:2421`); quoted `case` patterns compared literally (`:3854`); `sh` with no arguments
is always interactive so `echo cmd | sh` fails (`:4752`); combined flags like `-ec` are rejected
(`:4734-4749`); more than 511 arguments fails with "out of memory" (`:21`, `:287`); closing fds
0-2 silently opens `/dev/null` (`:2643-2647`).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

POSIX behavior for these constructs, or explicit errors where unsupported.

## Done when

- Native Slop tests for `3>file cmd`, `case x in "x") ...`, `echo 'echo ok' | sh`, `sh -ec`,
  large argument lists, and `exec 1>&-`.
