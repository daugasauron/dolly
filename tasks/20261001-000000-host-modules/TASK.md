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

Remaining:
- The display mailbox also carries core terminal state: split a runtime-owned
  terminal mailbox. Plan (2026-10-01):
  - Move `result_sequence`, `result_status`, `foreground_pid`, `flags`
    (foreground interruptible), `interrupt_sequence` and `interrupt_target_pid`
    to a `dolly_terminal_mailbox` in the runtime, exported through the
    supervisor contract. The kernel writes it from `dolly.c`; the page's
    Ctrl+C and the test helpers read it through `host/runtime/`. Images without
    a display then keep foreground, result and interrupt semantics.
  - `terminal_cols`/`terminal_rows` stay: the display library writes them.
  - The resident display library (`src/ghostty/`) does not touch the six
    fields, but removing them shifts every later offset it does use, so drop
    them (and bump `DOLLY_DISPLAY_MAILBOX_VERSION`) with the next catalog
    rebuild. Until then they can stay as unused padding.
- Stage 3 (owner decision): move display, HTTP, download and upload operations
  and packets from `process.h` into their modules. Today their layouts are in
  the exact-bytes process ABI digest; gpu and audio packets are identified only
  by `NAME@0`. Moving them without a per-module digest (like threads'
  `DOLLY_THREADS_ABI_DIGEST`) would weaken executable identity, so choose:
  per-module digests stamped by the client, or keep module packets in `process.h`.
- `threads@0` kernel code stays in `process-kernel.c` (thread table).
- Stale path comments that change pinned bytes, for the next seed change:
  `host/upload/upload.h` (names `abi/dolly-upload-0.wat`) and the Pi skill
  `demos/pi/skills/dolly/SKILL.md` (names `src/host/`, `src/http-*.mjs`).
