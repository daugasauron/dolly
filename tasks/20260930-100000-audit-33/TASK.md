# find -exec + batching and xargs size limits

- STATUS: OPEN
- PRIORITY: 230
- TAGS: bug,commands,core

`find.c:314`: with `-exec ... {} +`, after a batch exits non-zero the path that triggered the
flush is dropped. `xargs.c:279` sets `maximum = SIZE_MAX`, so there is no argument-size batching
and `find | xargs` on a large tree fails with E2BIG. `find.c:178-223` reimplements `fnmatch`.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Every path reaches exactly one batch; xargs splits by the system argument limit.

## Done when

- Browser or native tests: `find -exec false {} +` over N files invokes every file; `seq 1
  200000 | xargs echo | wc -l` succeeds with more than one batch.
