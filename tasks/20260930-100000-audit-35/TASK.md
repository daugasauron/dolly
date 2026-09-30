# core-tools and install report wrong results or silent success

- STATUS: OPEN
- PRIORITY: 200
- TAGS: bug,commands,core

`modules/core-tools.dm`: `file` reports UTF-8 text as "data" (`:594`), `echo --` prints an empty
line (`:228`), `stat` prints `%a` as 0 and echoes unknown `%` formats (`:521-523`), `/bin/cd`
exits 0 with no effect (`:103-128`) so `command cd`, `xargs cd`, `find -exec cd` do nothing.
`install.c:183-188` ignores `-m/-o/-g/-p`.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Correct output or explicit failure.

## Done when

- Browser tests for each command's corrected behavior.
