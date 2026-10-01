# Pi tool replacement loses truncation and corrupts binary edits

- STATUS: CLOSED
- PRIORITY: 120
- TAGS: bug,pi,demo

`src/pi/dolly-tools.js` replaces Pi's bash/read/write/edit tools. Neither `bash` (`:60-80`) nor
`read` (`:84-99`) truncates, so one `cat` of a large log floods the model context; `bash`
re-sends the whole accumulated output on every chunk; `edit` corrupts non-UTF-8 files
(`:128-137`) because `Dolly.readFile` replaces invalid bytes with U+FFFD. Upstream Pi exposes
pluggable operations (`coding-agent/src/core/tools/bash.ts:63`, `read.ts:49`, `edit.ts:96`).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03` and pinned Pi 0.84.4 sources.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Pi's own tools run with Dolly-backed operations, keeping upstream truncation and edit semantics.

## Done when

- `test/pi-tools.test.mjs` shows truncation of large output, incremental streaming, and a
  byte-exact edit round trip on a file containing invalid UTF-8.

## Progress (2026-10-01)

Pi runs upstream's bash and edit tools over Dolly operations, restoring
truncation and streaming (`4e92b84`, tested in `demos/pi/test/pi-tools.test.mjs`).
Edit refuses non-UTF-8 files instead of corrupting them; the byte-exact round
trip in "Done when" is not implemented.

## Resolution (2026-10-01)

`demos/pi/dolly-tools.js` now gives Pi's upstream edit tool byte-preserving
operations: each byte that is not UTF-8 crosses the edit as one code point of
U+10FF80..U+10FFFF and is written back unchanged; a file that already holds
those code points is refused. Upstream Pi on Node would write U+FFFD instead.
With Pi 0.99.2, `demos/pi/test/pi-tools.test.mjs` edits a file mixing a BOM,
Latin-1, a surrogate encoding and CRLF/emoji text byte-exactly, and refuses
the reserved range; in Chrome, `npm run test:demos -- pi` edits `old\377` to
`new\377` through the scripted model and `cmp` confirms the bytes (fixture
`demos/pi/test/fixtures/pi-tools.mjs` checks the same inside Dolly). Truncation
and streaming were restored earlier (`4e92b84`) and remain covered.
