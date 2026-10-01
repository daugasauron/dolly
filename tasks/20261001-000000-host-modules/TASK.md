# Host modules: one directory per bridge, a module-agnostic core

- STATUS: OPEN
- PRIORITY: 330
- TAGS: core,architecture,boundary,abi

Owner direction (2026-09-30/10-01): the core is library code for a generic,
extensible runtime. A host bridge is one modular component: a host JS module
plus the runtime C header that maps to it. Chosen layout: one directory per
module.

```
host/<name>/   module.json, <name>.mjs (browser(), worker()), helpers,
               dolly-<name>-0.wat, <name>.h, kernel.c, client.c, README.md
host/modules.mjs   the one registry: a list of module names
abi/           core contracts: process, gate, supervisor, dso, host records,
               dolly-browser-0.wat (the outer import allowlist)
include/dolly/ runtime.h, process.h, host.h
src/           kernel core, supervisor, process Worker, page shell
```

Each module is described by one manifest, `host/<name>/module.json`, the only
place its files are listed (owner, 2026-10-01). Everything reads it generically:
the registry loads the manifest and the provider it names; the build takes kernel
sources, process clients, headers and WAT contracts from it; packaging, the test
server and the ABI tests iterate the manifests. The WAT stays the canonical ABI:
the manifest only assigns ownership, and a test checks its `imports` against the
WAT. `runtime` uses the same format; its manifest points at the core contracts.

```json
{ "name": "http", "version": 0, "dependencies": ["runtime@0"], "phase": "kernel",
  "imports": ["env.dolly_http_dispatch"], "contracts": ["dolly-http-0.wat"],
  "headers": ["http.h"], "host": "http.mjs", "kernel": ["kernel.c"], "client": ["client.c"] }
```

Adding a bridge = its directory + one registry line + its import in
`abi/dolly-browser-0.wat` + its row in `docs/browser-boundary.md`. The last two
stay hand-written: they are where a human reviews authority.

## Findings (four read-only audits, 2026-09-30, reports in `build/evidence/simplify/`)

- gpu, audio and threads already follow the pattern: own WAT op numbers; the
  kernel reaches gpu/audio through `dolly_<m>_process_call` and
  `dolly_<m>_release_owner` only.
- display, http, download and upload predate it: ~800 of `dolly.c`'s 1,168 lines,
  ~360 lines of `process-kernel.c`, and ~150 lines of the ABI-hashed `process.h`.
- ~430 of `browser.mjs`'s 770 lines are display input, snapshot save UI and build
  wiring; `runtime-worker.mjs` hard-codes session restore.
- Module lists are hand-kept in ~15 places (`build.sh`, CMake, `package-pages.sh`
  twice and disagreeing, `browser-server.mjs`, `dolly.artifacts.mjs`,
  `generate-abi-constants.mjs`). Contract fields `abi` and `header` are never read.
- The display mailbox also carries core terminal state (foreground pid,
  interrupts, input ring), so the terminal depends on display@0's layout.

## Plan

1. JS (no kernel or image bytes change; test against current images): move module
   JS into `host/<name>/`; move display input, snapshot UI and build wiring out of
   `browser.mjs` behind generic page resources and hooks; session restore as an
   explicit snapshot phase; derive every module list from the registry or the
   directory; remove dead code found by the audits.
2. C (kernel bytes change, process ABI unchanged): move WATs, headers, kernel C and
   clients into `host/<name>/`; one static `dolly_kernel_module` table replaces
   per-module switch cases and release calls; build globs `host/*/`.
3. Process ABI (every executable and image rebuilds): move display, http, download
   and upload ops and packets from `process.h` into their modules; split a
   runtime-owned terminal mailbox from display@0.

## Done when

- `grep -rn "display\|http\|gpu\|audio\|download\|upload\|snapshot\|threads" src/browser.mjs src/runtime-worker.mjs src/process-kernel.c src/dolly.c`
  finds only registry-driven code.
- Adding a module touches only its directory plus the two review points.
- source, artifact, core and browser suites pass in Chrome and Firefox after each stage.

## Progress (2026-10-01, branch `core/host-modules`)

- Stage 1 done: `host/NAME/module.json` per module; registry, build, CMake,
  sysroot, constants, packaging, test server and ABI tests read manifests
  (`fe9cac9`); format documented in [`host/README.md`](../../host/README.md).
  The manifest-driven ownership test caught the runtime's terminal output
  declared in the display contract; it moved to the supervisor contract.
- Stage 2 done: `dolly_kernel_module` table generated from manifests; display,
  HTTP, download, upload, GPU, audio kernel code in `host/NAME/kernel.c`;
  `process-kernel.c` names no module (`5a9b77e`).
- `cc` links every client archive by default; GPU and audio clients ship once,
  in the seed (`790d66e`, `07cf165`).
- Page shell done: display input, session UI and build admission live in their
  modules; `src/browser.mjs` 770 -> 376 lines (`eb4f1c5`). Session restore moved
  from the runtime Worker into the snapshot module's `imageRestored` hook.

- Display's kernel state (mailbox, frames, lease, terminal device) moved to
  `host/display/kernel.c`; `src/dolly.c` keeps the terminal line discipline and
  reaches the device through `dolly_kernel_terminal_attached/render/read`
  (988 -> 361 lines). Image inputs unchanged.

- Runtime terminal mailbox (`ece144d`, branch `work/terminal-mailbox`):
  foreground pid and interruptibility, shell result and the page's interrupt
  request live in `dolly_terminal_mailbox` (`src/dolly.c`), exported as
  `dolly_terminal_mailbox_address` (supervisor contract) and read on the page as
  `host.get("runtime").terminal`. Display mailbox version 6 (25 fields, events at
  byte 100) also drops the never-read `event_wake`/`event_dropped`. Seed change:
  every image rebuilds. A display-less embedding of `system-build` interrupts its
  foreground ENTRY (`test/host-compute-browser.mjs`). The core artifact and
  browser suites pass in Chrome and Firefox, except `cpp-browser`, whose
  outside-import plugin case fails independently of this change.

- Stage 3 done (branch `work/module-digests`): display, HTTP, download and
  upload op numbers are globals in their WAT contracts and their packets live
  in `display.h`/`http.h`; `process.h` holds only the core process ABI. One
  mechanism identifies every module with a client (display, http, download,
  upload, gpu, audio, threads): `generate-abi-constants.mjs` writes
  `DOLLY_NAME_ABI_DIGEST` (SHA-256 of the exact bytes of the module's WATs and
  other headers) into `NAME-abi.h` and `abi.mjs`; the client stamps it into its
  `dolly.host` record (now 72 bytes); each provider exports the `digest` it
  implements; the loader refuses a different digest for executables and DSOs.
  Threads lost its separate `dolly.threads` stamp (an executable requiring
  `threads@0` is threaded); the runtime adapter no longer records `runtime@0`.
  `test/host-modules-browser.mjs` proves a one-bit digest change is refused
  (126) before entry. Seed change: every image rebuilds. Source (342), core
  artifact (21) and browser suites pass in Chrome and Firefox, except
  `host-compute` in Firefox: headless Firefox here returns no WebGPU adapter,
  so `gpu@0` is never enabled (its display-less interrupt half passes).

Remaining:
- `threads@0` kernel code stays in `process-kernel.c` (thread table).
- The done-when grep still finds module names in `src/browser.mjs` (display
  transport, HTTP policy and page status) and the snapshot boot path in
  `src/runtime-worker.mjs`/`src/dolly.c`.

## Decision (owner, 2026-10-01): stage 3

Per-module digests: display, HTTP, download and upload packets move from
`process.h` into their modules' headers, each with a layout digest its client
stamps (as threads does with `DOLLY_THREADS_ABI_DIGEST`); `process.h` keeps only
the core process ABI.
