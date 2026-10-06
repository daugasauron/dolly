# Trusted browser code is too large and carries test-only surface

- STATUS: OPEN
- PRIORITY: 250
- TAGS: core,boundary,cleanup

## Remaining (2026-10-07)

Measured on the candidate's line: 62 files, 9,319 lines of trusted
JavaScript, the kernel's generated loader gone (below). Step 1 (five lines
nobody read) is on `core/trusted-surface` in `integrate/round3`, not in the
candidate. Left, in the order proposed below: 2, the test logic out of the
display provider into one injected harness (needs a catalog round); 3, what
the 21 `__dolly` accessors and the page attributes are (embedding API or
test probes: an owner decision); 4, load a provider only when the image
declares its module; 5, the review map naming or removing the 18 unnamed
files, most of them the process Worker's DSO loader and FFI, which
`20261006-111835-dso-module` moves out of every Worker (bundle 65,304 to
9,112 bytes).

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

## Measured (2026-10-06 night, `integrate/next` at `80595976`, runtime `f678b99a…`)

Scripts are in `build/trusted-evidence/` of `work/kboundary` (not committed):
`graph.mjs` follows imports and Worker URLs from the page, the runtime Worker
and the process Worker; `loaded.mjs` records what Chrome requests while a page
boots and runs one command; `hooks.mjs` counts the users of each `__dolly`
member.

**What a page can load: 62 files, 9,319 lines, 430,337 bytes** (`src/` 22
files and 4,841 lines, `host/` 39 and 4,450, the service worker 28). On the
branch with the seed as a snapshot (`core/kernel-boundary-2`) it is 9,310. The
kernel's generated loader, 48 KB that this audit called unreviewable, is gone
(`20261005-133401-kernel-boundary`).

| Part | Files | Lines | Bytes |
| --- | --- | --- | --- |
| Process Worker: `process-worker`, `process-ffi`, `process-abi`, `wasm-interface`, `process-constants` | 5 | 1,991 | 75,768 |
| Runtime Worker and boot: `runtime-worker`, `image-artifact`, `custom-image`, `image-entry`, `image-inputs`, `static-asset`, `snapshot-records`, `kernel-plugin` | 8 | 1,002 | 49,689 |
| `host/display` | 3 | 974 | 41,049 |
| `host/gpu` | 4 | 893 | 53,952 |
| Recipes and builds in the page: `dollyfile-view`, `dollyfile-graph`, `image-build`, `image-builder`, `session-store` | 5 | 788 | 37,115 |
| Supervisor | 1 | 767 | 34,358 |
| `host/http` | 5 | 711 | 32,527 |
| `host/snapshot` | 4 | 476 | 24,057 |
| Page shell: `browser`, `page-indicators`, `build-log`, service worker | 4 | 321 | 15,092 |
| Registry: `host/modules`, `manifests`, `requirements`, `abi` | 4 | 297 | 15,636 |
| `host/audio`, `upload`, `build`, `runtime`, `download`, `packages`, `threads` | 19 | 1,099 | 51,094 |

**What a page does load** (Chrome, boot and one command): 71 scripts for
`system`, 74 for `default`. The same 56 from the checkout either way, 7,180
lines and 326,806 bytes: every provider is imported whatever the image
declares, so a `default` page loads the GPU, audio, build and upload
providers it does not use. The other 15 to 18 are generated: the process
Worker bundle (65 KB), the image registry (50 KB), and one metadata module per
image of the chain, 790 KB for `system` (`ghostty-build` 174 KB, `zig-build`
172 KB), which is data, not code.

**The test surface.** `window.__dolly` has 23 members. No trusted code uses
one: 43 test files do, with `demos/browser.mjs` (the demo harness) and
`scripts/accept-release.mjs` (the release's acceptance, 2 members).

- Used by nobody: `display`, `systemInputs`; and two page attributes,
  `data-boot-mode` and `data-snapshot-bytes`, the second with a variable, three
  assignments and a message field in the runtime Worker that exist for it.
- Logic that only tests run, in the display provider: `waitFor`, `submit`,
  `visibleTerminalText`, `waitForInteractiveTerminal` (55 lines) and
  `pushSyntheticKey`, `inputIdle`, `fontSize` of its transport; they need
  only `transport` and `terminal`, which are members too. Used in 30 files.
- Plain accessors: `transport`, `terminal`, `foregroundPid`, `graphicsActive`,
  `input`, `paste`, `key`, `copySelection`, `httpActive`, `httpRequestCount`,
  `httpCompletedRequestCount`, `gpu`, `audio`, `sessionName`, `saveSession`,
  `hostModules`, `systemSnapshot`.
- 42 writes of 22 `data-*` attributes: 4 are read by trusted code or the
  page's HTML (`indicators`, `gpu`, `downloading`, `session-status`), 16 only
  by tests, demos or scripts, 2 by nobody.
- 17 files launch a browser: the two harnesses (`test/browser.mjs`,
  `demos/browser.mjs`), 2 core GPU tests, 11 demo tests and 2 scripts.

**The review map.** `docs/browser-boundary.md` names, directly or through a
module's manifest, 44 of the 62 files (6,265 lines). The other 18 (3,054
lines) are named nowhere in it: `process-ffi` 693, `process-worker` 537,
`wasm-interface` 391, `dollyfile-view` 314, `process-constants` 246,
`session-store` 197, `process-abi` 124, `snapshot-records` 109,
`dollyfile-graph` 108, `image-build` 96, `host/requirements` 59,
`custom-image` 52, `build-log` 30, `image-entry` 29, the service worker 28,
`image-inputs` 20, `host/manifests` 16, `host/abi` 5. It mentions "one bundled
process Worker" without a link.

## Order proposed

1. **Remove what nobody reads** (done, below): runtime-only, the core suites
   cover it.
2. **Move the test logic out of the display provider** into one harness file
   that every launch point injects (`addInitScript`); `__dolly.submit` and the
   two text helpers keep their names for the 30 files that call them, defined
   by the harness instead of the provider. About 75 lines leave trusted code.
   It touches all 17 launch points, so it needs every demo suite and the GPU
   tests: a round with the whole catalog, not one tree with the core chain.
3. **Decide what the remaining accessors are.** The release's acceptance
   drives pages through them, so they are in effect the embedding API: either
   documented beside `DOLLY_HTTP_POLICY` and `DOLLY_HOST_MODULES`, or handed
   to an embedder's callback instead of every page's `window`. The 21
   attributes get the same decision; `data-dolly-status` is the page's
   status, the others are probes.
4. **Load a provider only when the image declares its module.** A `default`
   page would stop loading `host/gpu`, `audio`, `build`, `upload`, `download`
   and `snapshot`'s UI: what a reviewer of that page reads shrinks by more
   than any deletion here. Runtime-only; changes `host/modules.mjs`.
5. **Make the review map complete**: name the 18 files or remove them. The
   bulk is the process Worker's DSO loader and FFI
   (`20261002-073000-runtime-process-modules`, `dso@0` in progress).

The total is recorded here at each step, as the review of 2026-10-05 asked.

## Step 1 (2026-10-07, `core/trusted-surface` on `80595976`)

Removed, each with no reader in trusted code, tests, demos or scripts:
`__dolly.display`, the display provider's `presenter` getter,
`__dolly.systemInputs`, and the page attributes `data-boot-mode` and
`data-snapshot-bytes`. Five lines; the total is 62 files, 9,314 lines,
430,055 bytes. `__dolly` has 21 members.

Left on purpose: the runtime Worker still computes `snapshotBytes` and sends
it in its `ready` message, now read by nobody. Those lines are rewritten by
the seed branch (`core/kernel-boundary-2`), so removing them here would
conflict; they go once that branch is merged.

Runtime-only: runtime `f678b99a…` and image inputs `4431ea80…` are the
base's. Verified with the images of `work/next` (19 imported, same image
inputs): source 400 of 400; artifacts 22 passed, 1 skipped; 27 core browser
suites in Chrome and in Firefox, 26 passed in each
(`build/trusted-evidence/step1/summary.txt`, `step1-more/summary.txt`).
`amy` fails in both at `amy install cmake`, as it does on the base
(`work/next/build/next-evidence/browser-final/amy-chromium.log`): the
`cmake` package is not built in either tree. Not run: `fs-growth` (the 6 GB
cap kills it on any runtime), `gpu-render` (needs a hardware adapter),
`site`, and every demo suite.

