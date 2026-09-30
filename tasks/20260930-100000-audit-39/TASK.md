# Pi tool replacement loses truncation and corrupts binary edits

- STATUS: OPEN
- PRIORITY: 240
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
