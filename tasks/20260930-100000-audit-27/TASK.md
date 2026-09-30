# Slop ${X:?} and error expansions do not abort the script

- STATUS: CLOSED
- PRIORITY: 280
- TAGS: bug,slop,core

`${X:?}` only fails the one command (`src/slop.c:1090-1102`); a following `rm -rf "$X"/*` still
runs.

## Evidence

Established: REPRODUCED. Chrome, `default` image: `/bin/slop -c 'X=; echo ${X:?unset}; echo
continued > /tmp/cont'; test ! -e /tmp/cont` -> status 1 (the script continued).

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

A `${X:?}` failure in a non-interactive shell exits the shell with non-zero status.

## Done when

- Native Slop test: script stops at `${X:?}` and returns non-zero; interactive shell prints the
  error and continues.

## Result (2026-10-01)

`${X:?}`, arithmetic and other expansion errors exit a non-interactive shell
with status 1 (`f70583c`). Cases "unset parameter error exits the shell" and
"arithmetic error exits the shell" pass natively and in the browser.
