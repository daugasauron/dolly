# Trusted browser code is too large and carries test-only surface

- STATUS: OPEN
- PRIORITY: 150
- TAGS: boundary,cleanup

About 7,600 lines / 341 KB of trusted-perimeter JS across ~33 files (`browser.mjs` 792,
`process-supervisor.mjs` 773, `process-ffi.mjs` 693, `gpu-worker.mjs` 690 with 56 lines over 120
columns). The production page exposes `window.__dolly` (`src/browser.mjs:723-778`),
terminal-scraping helpers (`:449-510`) and 46 `dataset.*` writes. SHA-256-to-hex is written four
times (`browser.mjs:161-163` despite importing `sha256`), `MAX_DOLLYFILE_BYTES` is redefined
(`runtime-worker.mjs:16`), the `_dolly/<digest>` strip regex appears four times, the `boot()`
catch repeats `displayFatal`, `encodeSessionSnapshot` (`session-store.mjs:109-122`) is
test-only, upload polls every 50 ms forever (`src/host/upload.mjs:12`). `Dollyfile-system:6-10`
declares display/http/download/upload/snapshot so requirements barely narrow derived images.
Emscripten generated glue for runtime imports is part of the perimeter but not reviewable.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Authority code is short and reviewable; test hooks are separated from production code.

## Done when

- Line count of trusted JS reduced; duplicates removed; test hooks isolated; behavior tests
  pass.

## Progress (2026-10-01)

- The page shell knows no module: display input, session UI and build admission
  moved into their modules (`src/browser.mjs` 792 -> 376 lines); session restore
  moved from the runtime Worker into the snapshot module.
- Duplicates removed: seven hex encoders, three dylink readers, a second
  `MAX_DOLLYFILE_BYTES`, a second `sha256`, the supervisor's stop sequence,
  unused spawn options, audio counters, dead display methods.
- Remaining: the test helpers in `window.__dolly` (submit, visible text, waits)
  still ship in the page; 54 test files and about 20 page launch points use them.
- Measured on `next` (2026-10-01 afternoon): 5,157 lines in `src/*.mjs` and
  3,437 in `host/*/*.mjs`; `src/browser.mjs` 380, `src/process-supervisor.mjs`
  742, `src/process-worker.mjs` 556, `src/runtime-worker.mjs` 380.
