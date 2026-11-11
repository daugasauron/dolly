# Host modules that are modules: the core names none of them, a module plugs in by generic hooks

- STATUS: OPEN
- PRIORITY: 450
- TAGS: host-modules,architecture,core,kernel,audit

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, A1, A2, A7). Owner (2026-11-12): "the host-module actually being
modular is extremely important, this is top priority to fix, if the contract has to change thats
fine, but it definitely seems the current implementation is broken from an architecture point of
view." Earlier: 2026-10-01 "If the core is slop it will be impossible to extend it"; 2026-11-04 "I
feel like the modularity of the host modules have been lost somewhere along the way".

## State (2026-11-12)

Filed; work starts today.

## Found

- "Host module" names seven mechanisms (A1): leased devices (gpu, audio, microphone, nena: one
  import, `src/device-lease.c`), dispatch imports with their own framing (http, download, html),
  mailboxes in kernel memory (display, input, touch, upload, snapshot), kernel exports the host
  calls (console), kernel features the supervisor delivers (threads, pty, sockets), process-Worker
  code (dso, stack) and reserved URLs on the broker (build, packages).
- The core knows modules by name (A2): `src/process-supervisor.mjs` imports `host/threads/*` and
  calls `dolly_threads_*`, `dolly_pty_take_signal`/`_taken_signal` and `dolly_console_spawn`;
  `host/runtime/runtime.mjs` imports the supervisor back. The kernel core calls the display's and
  input's functions (`src/dolly.c:156-212`, `src/process-kernel.c:1780`, declared in
  `src/process-kernel.h`). Disabling `pty@0` or `threads@0` removes no code path.
- Every module's `kernel.c` is linked into every kernel; a manifest switches only the JavaScript side.
- A runtime is "a module that provides the kernel", with plural machinery for the one there is (A7).

## Do

- The core (kernel core, supervisor, workers, boot, registry) names no module but `runtime@0`.
  Module code lives in its directory and attaches through generic hooks: the kernel module table
  (operations, release, signal and event hooks), one supervisor event export in place of the
  module-specific polls (a signal for a pid, a spawn on given streams), and Worker-side hooks the
  registry calls.
- `host/README.md` states the kinds a module may be and what each provides, short enough that a
  reviewer can ask "does it follow the pattern".
- The kernel is built from the modules the manifests list (`host/manifests.mjs`), so a module
  removed from the list is absent from the kernel too.
- Contracts change where they must; Donna is told of each change (it runs the kernel and contracts
  unchanged).

## Done when

- `grep` finds no module name but `runtime` in `src/process-supervisor.mjs`, `src/process-worker.mjs`,
  `src/process-kernel.c`, `src/dolly.c`, `src/browser.mjs` and `host/modules.mjs`, except through the
  generic tables.
- A module dropped from `host/manifests.mjs` builds a kernel and runtime that boot images not
  declaring it (measured for pty, console and threads at least), and the browser suites pass.
- `host/README.md` and `docs/browser-boundary.md` say the kinds; Donna's task records the contract
  changes.
