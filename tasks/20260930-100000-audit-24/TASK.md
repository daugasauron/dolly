# Trusted browser code is too large and carries test-only surface

- STATUS: OPEN
- PRIORITY: 250
- TAGS: core,boundary,cleanup

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

## Progress (2026-10-01, branch `work/core-polish`)

Removed from trusted code: the boot-error compiler-trace reader, the
`DecompressionStream`/`CompressionStream` fallbacks, the session marker write,
the plugin loader's hand-kept import list, the parser's start-section flag, the
kernel's unused exports. The TextDecoder shadowing at boot records its measured
reason. `window.__dolly` (24 members, 54 test files, 18 page launch points) is
unchanged: isolating it needs the harnesses to inject the helpers, which is a
test-infrastructure change rather than core polish; the upload module now polls
only during a transfer (25 ms), driven by the kernel storing without a notify.

## Review (2026-10-05, `20261005-131642-big-picture`): the number goes the wrong way

Reviewed trusted JavaScript, measured with `wc -l`:

| Date | `src/*.mjs` | `host/**/*.mjs` | Total |
| --- | --- | --- | --- |
| 2026-09-30 (this audit) | | | about 7,600 |
| 2026-10-01 | 5,157 | 3,437 | 8,594 |
| 2026-10-05 (`c5b9e132`) | 4,942 | 4,164 | 9,106 |

Plus 20% in five days while this task was open: the page shell shrank
(792 -> 204 lines) and the modules grew past it. Largest files:
`host/gpu/worker.mjs` 695, `src/process-supervisor.mjs` 744,
`src/process-ffi.mjs` 684, `host/display/display.mjs` 548,
`src/process-worker.mjs` 536.

What is left, in order of lines:

1. The DSO loader (`src/process-worker.mjs:80-413`, about 330 lines) and FFI
   (`src/process-ffi.mjs`, 684 lines) are 11% of the total and run in every
   process Worker. Their users are two demos: CPython (extension modules and
   `_ctypes`) and Neovim (parsers). Whether they become a module an image
   declares is recorded in `20261002-073000-runtime-process-modules`.
2. Test surface in production: `window.__dolly` (24 members; `submit`,
   `visibleTerminalText`, `input`, `key`, `paste` in
   `host/display/display.mjs:485-495`) is used by 41 test files. It is also
   the only way an outer harness drives a Dolly page, yet no document names
   it. Either it is the embedding API, documented beside `DOLLY_HTTP_POLICY`
   and `DOLLY_HOST_MODULES`, or the tests inject it.
3. From `20260930-100000-audit-58` (closed into this task): two demo tests
   still rewrite the trusted GPU worker's source text before serving it
   (`demos/zero-ad/test/0ad-menu-browser.mjs:13`,
   `demos/gpu-fluid/test/gpu-fluid-browser.mjs:11`).

Emscripten's generated glue, which this audit called "part of the perimeter
but not reviewable", is `20261005-133401-kernel-boundary`.

Done when, made measurable: the total above is recorded at each release and
does not grow without a line here saying which authority was added.
