# Janis silent no-ops and dead shim code

- STATUS: OPEN
- PRIORITY: 170
- TAGS: bug,janis,demo,cleanup

`chmod` does nothing, `accessSync` ignores its mode, `mkdtemp` is not exclusive,
`createReadStream` ignores `start`/`end`, `fetch` ignores `redirect`, `util.inspect(fn)` returns
undefined, `os` memory/CPU counts are 0. In `dolly-node.js` the timers and stdio objects are
overwritten by `janis.js` (dead). Studio's `lint.mjs` uses qjs `Dolly.*` while `build.mjs` uses
Janis Node APIs.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Unsupported options fail explicitly; dead shim code removed.

## Done when

- Tests for each API; dead code deleted.
