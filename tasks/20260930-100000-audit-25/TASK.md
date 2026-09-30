# Slop treats a lone & as an ordinary word

- STATUS: CLOSED
- PRIORITY: 290
- TAGS: bug,slop,core

`operator_kind` returns TOKEN_WORD for `&` (`src/slop.c:1325`) and the word loop swallows it
(`:1463-1470`). `server &` runs in the foreground with `&` in argv; `cmd &>/dev/null` passes `&`
and redirects only stdout.

## Evidence

Established: REPRODUCED. Chrome, `default` image: `/bin/slop -c 'echo hi > /tmp/amp2 &'; test
"$(cat /tmp/amp2)" = 'hi &'` -> status 0 (the file contains the literal `hi &`).

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

`&` is either implemented (background job, `$!`) or rejected with a syntax error; never passed
as a word.

## Done when

- Native `test/slop.test.mjs` and a browser check cover `cmd &`, `cmd &>/dev/null` and `a & b`.

## Result (2026-10-01)

A lone `&` is a syntax error before anything runs; `&>` and `&>>` redirect
(`f70583c`). Cases "background jobs are rejected before anything runs" (native
and browser) and "bash redirections name stdout and stderr" (browser) in
`test/fixtures/slop-cases.mjs` pass.
