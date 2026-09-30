# Slop runs pipeline stages inside the shell process

- STATUS: CLOSED
- PRIORITY: 270
- TAGS: bug,slop,core

Pipeline stages run inside the shell itself (`src/slop.c:3164`): `exit 3 | cat` ends the script,
and stage side effects (cd, variable assignment) leak into the shell.

## Evidence

Established: REPRODUCED. Chrome, `default` image: `/bin/slop -c 'exit 3 | cat; echo after >
/tmp/after'; test -e /tmp/after` -> status 1 (the script exited).

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Each stage of a multi-command pipeline runs in a subshell environment; the shell continues.

## Done when

- Native Slop tests: `exit 3 | cat; echo after` prints `after`; `x=1 | true; echo ${x-unset}`
  prints `unset`.

## Result (2026-10-01)

Every pipeline stage runs in a subshell (`f70583c`). The case runs in `test/slop-browser.mjs` (Chrome and Firefox) from `test/fixtures/slop-cases.mjs`: "pipeline
stages are subshells" checks that `exit 3`, an assignment and `cd` in stages
leave the shell unchanged.
