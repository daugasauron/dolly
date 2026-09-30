# Slop assignment prefixes do not see earlier assignments

- STATUS: OPEN
- PRIORITY: 260
- TAGS: bug,slop,core

`a=x b=$a` leaves `b` empty (`src/slop.c:3037`, `:3086`): assignments are expanded before any is
applied.

## Evidence

Established: REPRODUCED. Chrome, `default` image: `/bin/slop -c 'a=x b=$a; test "$b" = x'` ->
status 1.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Assignments are performed left to right, each visible to later words.

## Done when

- Native Slop test for `a=x b=$a` and `a=x b=$a cmd` semantics.
