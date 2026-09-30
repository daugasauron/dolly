# Dollyfile parsers and graph walkers disagree and are duplicated

- STATUS: CLOSED
- PRIORITY: 230
- TAGS: dollyfile,bug,core

The grammar exists in C (`src/dollyfile.c`, 1,939 lines, ~500 grammar) and JS
(`src/dollyfile-view.mjs`, 303 lines, copied into Studio by `prepare-image-sources.sh:240`),
plus two JS graph walkers (`scripts/dollyfile-graph.mjs`, `src/image-requirements.mjs`); the
depth/cycle limit is implemented three times. `test/dollyfile-parser.test.mjs` compares only ~33
rows (no REQUIRES HOST, continuation lines, CRLF, FILE bodies, ENTRY limits). `REQUIRES HOST
gpu@0` together with `gpu@1` is rejected by JS (`src/host/requirements.mjs:17`) but accepted by
C (`src/dollyfile.c:1370-1385`).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

One authoritative grammar with exhaustive agreement tests; one graph walker.

## Done when

- Parser agreement tests cover every directive, continuation, CRLF, FILE bodies, ENTRY limits
  and duplicate host requirements; both parsers agree.

## Resolution (2026-10-01)

Fixed in `76a941a`: one recipe graph walker (`src/dollyfile-graph.mjs`) replaces
the three; the C executor and the JavaScript parser agree on conflicting host
revisions, provider limits, IMAGE/MODULE lines and `SOURCE HOST` paths.
Verified by `test/dollyfile-parser.test.mjs` ("the C executor and the JavaScript
recipe graph accept exactly the same recipes", "the C and JavaScript parsers
decode the same words and values"), passing on `core/host-modules`.
