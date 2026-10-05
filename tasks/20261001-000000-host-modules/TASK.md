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

## Progress (2026-10-01, branch `work/core-polish`)

- The image boot exports (`dolly_bootstrap_*`, `dolly_snapshot_*`,
  `dolly_write_file`) are implemented by the runtime, so they moved from the
  snapshot module's contract to the runtime's `abi/dolly-image-0.wat`; the
  snapshot contract keeps the session mailbox only. `snapshot.h` is
  kernel-private and no longer published to programs.
- The supervisor admits executables against the enabled providers (an
  executable needing a disabled module exits 126 before entry, as
  `docs/browser-boundary.md` says).
- The kernel-plugin contract offers `strlen`, `memcmp` and `bcmp` and imports
  `fclose` under its own name; `modules/ghostty.dm` lost its libc shim.
- Recorded, not changed (each is a contract change): the hand-copied display,
  upload, snapshot and terminal mailbox layouts and the shared device header;
  the display kernel's font path (driver ABI); the four always-set GPU feature
  bits; the HTTP clients' 10 ms sleeps and the upload page's 25 ms polling
  (DEFERRED-based waits would replace them); the session save blocking the
  kernel thread for up to 30 s per chunk; the version/capacity handshake
  exports the digests make redundant; threads wired through
  `setThreadProvider`.

## Re-audit and plan (2026-10-02, branch `core/host-modules-2` on `e30c0b0`)

Re-audit of the remaining list against the current code:

- `src/runtime-worker.mjs` and `src/dolly.c` name no module. Their
  `snapshot` words are the runtime's own image-artifact vocabulary
  (`dolly_snapshot_*`, `dolly_bootstrap_snapshot*` of
  `abi/dolly-image-0.wat`, `src/system-snapshot.c`, `dist/*.snapshot`), not
  the `snapshot@0` session module. Renaming the image format is churn across
  dist, scripts and docs for no architectural gain; the done-when grep is
  read as "names no host module" for those two files.
- `src/browser.mjs` still names display (transport, page API), http (policy
  consumption, custom-tab restriction, build network, local services), gpu,
  audio and snapshot (session restore selection, `snapshot@0` requirement,
  configuration, page API), and tests `display@0` to decide runnability.
- `src/process-kernel.c` holds the thread table (`threads[64]`,
  `signal_tid`, `next_thread_tid`) and the four `dolly_threads_*` exports of
  the threads supervisor contract.
- Recorded debts still present: hand-copied mailbox word indices (display 25,
  upload 10, session 11, terminal 6) mirrored in JS classes; the display
  kernel's font path; four GPU feature bits the provider always sets
  (`CAPTURE_FRAME`, `TEXTURE_RENDER`, `LARGE_BATCH`, `VERTEX_F16`; used by
  `test/fixtures/gpu-render.c` and `demos/slopyard/src/render.c`); `usleep`
  polling in `dolly_http_perform` and 25 ms polling in `UploadTransport`;
  `dolly_session_service` blocking the kernel thread per chunk;
  version/capacity handshake exports; `setThreadProvider`. The device-lease
  header is `src/device-lease.h` only (the gpu/audio kernels include it); the
  32-byte packet header is not duplicated in the client headers.

Ordered plan (each step verified by the source suite, `core-browser` in
Chrome and Firefox, `host-modules-browser`, `boundary-browser` and the tests
of the touched module; steps 1-4 keep the image inputs hash `9f7a44a7…`):

1. Kernel-only C. `host/display/input-ring.c` holds the input-ring handling
   (`handle_terminal_event` and the UI compaction of
   `dolly_terminal_present_pending`), compiled by the kernel and directly by
   `test/terminal-ring.test.mjs` (audit-58). `host/threads/kernel.c` owns the
   thread table and the `dolly_threads_*` exports; the process kernel offers
   `dolly_kernel_dispatch(pid, tid, takes_signals, ...)`, a launching/running
   query and a thread-release hook, and names no module.
2. Page shell. The registry assembles `window.__dolly` from each browser
   instance's `page` object; the http module consumes the embedding's policy,
   restricts a custom tab from the inherited record, owns the local-services
   map and gives builders their configuration (`builder`); modules that
   depend on `http@0` reach these through `get("http")`; a static `boot(route)`
   hook lets the snapshot module select a restored session's image,
   requirement and configuration. An image is runnable when it has ENTRY.
3. Session save without blocking the kernel: `dolly_session_service` publishes
   one chunk per call and the page wakes the Worker after consuming each;
   same mailbox, no contract change.
4. `setThreadProvider` replaced by a registry extension the threads module
   declares and the runtime's supervisor reads once.
5. One contract batch (seed and every image rebuild, Rust seed, 0 A.D.
   relink), decided per item below after steps 1-4 are verified.

## Progress (2026-10-02, branch `core/host-modules-2`)

Kernel-only, page JS and transport steps (image inputs stayed `9f7a44a7…`):

- `host/display/input-ring.c` holds the input-ring handling; `host/threads/kernel.c`
  owns the thread table and the `dolly_threads_*` exports; the process kernel
  offers `dolly_kernel_dispatch(pid, tid, takes_signals, ...)`, a
  launching/running query and `dolly_kernel_thread_released`
  (`9cd887b`, `d953592`).
- The page shell is module-agnostic (`3bda5a60`): the registry assembles
  `window.__dolly` from `page` records, `host.builder` from `builder` records
  and `host.inherited` from `inherited` records, and a static `boot(route)`
  lets the snapshot module select a `/session/` route's image and
  configuration; the http module consumes the embedding's policy and owns
  the local-services map; `src/browser.mjs` is 204 lines and names no host
  module. `grep -rn "display\|http\|gpu\|audio\|download\|upload\|snapshot\|threads"`
  over the four core files now finds the canvas element id, the route modes
  and the runtime's image vocabulary only.
- Session saves no longer block the kernel thread (`664de355`): measured in
  Chrome, a 300-write shell loop took 2.68 s idle and 3.16 s while a 30.9 MB
  session saved in 3.16 s.
- Upload retirement is reported by the Worker instead of polled every 25 ms
  (`0ef54514`).
- `setThreadProvider` stays: the supervisor's thread model (Workers per
  thread, `thread-finished`, the signal receiver) is the core process model
  (`docs/process-model.md`), threads@0 depends on runtime@0 and `get` only
  reaches declared dependencies, so the dependent installs its provider on
  the runtime once; inverting the dependency or a generic extension registry
  would add more than the one guarded setter it replaces.

Verification per step: source suite (251), `core-browser`, `host-modules-browser`,
`boundary-browser`, `threads-browser`, `terminal-browser`, `upload-browser`,
`custom-session-browser` in Chrome and Firefox, `image-browser`,
`snapshot-stream-browser`, `host-compute-browser`, `gpu-indicator-browser`,
`amy-browser` in Chrome; the full Chrome suite after the page shell
(`browser tests: all passed in 364s`). Logs in `build/host-modules-evidence/`.

## Contract batch (2026-10-02)

One seed change, so every image rebuilds once:

- Display driver ABI v4: `initialize` takes no font path; the plugin
  (`src/ghostty/display.c`) names its own font, the kernel names no image file.
- Mailbox word indices are WAT globals (`DOLLY_DISPLAY_WORD_*`,
  `DOLLY_UPLOAD_WORD_*`, `DOLLY_SESSION_WORD_*`, `DOLLY_TERMINAL_WORD_*`)
  with the sizes beside them; the page transports import them, and the
  display and upload kernels assert their struct offsets against them (the
  session and terminal structs are kernel-private and keep their comment).
- The version and capacity handshake exports are gone
  (`dolly_display_mailbox_version/event_size/event_capacity/framebuffer_capacity/clipboard_capacity`,
  `dolly_http_mailbox_version/slot_count/chunk_capacity`,
  `dolly_upload_mailbox_version`,
  `dolly_session_mailbox_version/name_capacity/transfer_capacity`,
  `dolly_process_supervisor_version/mailbox_capacity`): the page JS and the
  kernel come from one build, and executables are checked by digest.
- Not changed: the four always-set GPU feature bits are required by the
  externally built 0 A.D. engine (`demos/zero-ad/toolchain/engine.patch`
  tests `TEXTURE_RENDER`, `LARGE_BATCH` and `VERTEX_F16`), so removing them
  means recompiling that engine; they go when it builds inside Dolly
  (`20260930-231200-self-host-zero-ad`). The HTTP client's 10 ms `usleep`
  between polls stays: a deferred POLL would change the packet semantics
  for an unmeasured gain, and the sleep only runs while no chunk is ready.

### Batch evidence (2026-10-02)

- `npm run build:runtime`: image inputs `9f7a44a7…` -> `2cc92c2b…`.
- Rust compiler seed rebuilt from the complete `rustc-port` (`demos/rust/build-rust-toolchain.sh`:
  "built and validated the complete Rust compiler seed").
- 0 A.D. engine relinked against process sysroot `c57850d7…` with the root
  checkout's `.cache/0ad` mounted read-only (`build/0ad/pyrogenesis.wasm`
  `e5129d82…`, stamped and validated; script in the evidence directory).
- `scripts/build-snapshot-browser.mjs` was the one `buildImage` caller the
  page-shell change had missed (`65d9589e`).
- Default chain (10 images) rebuilt in 843 s; on it: core, host-modules,
  boundary, terminal, upload and custom-session pass in Chrome and Firefox;
  threads, host-compute and snapshot-stream in Chrome.

## Review note (2026-10-05, `20261005-131642-big-picture`)

The pattern holds where it was applied: `src/browser.mjs` is 204 lines and
names no module, adding a module is its directory plus the two review points,
and the page shell, registry and digests should not be touched again. Close
this task once the full-catalog demo and artifact checks of the contract
batch have run. The module the pattern has not reached is `runtime` itself:
its manifest owns 26 imports that generated Emscripten code implements; that
is `20261005-133401-kernel-boundary`, a new task so this one can close.
