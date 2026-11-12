# Host modules that are modules: the core names none of them, a module plugs in by generic hooks

- STATUS: OPEN
- PRIORITY: 450
- TAGS: host-modules,architecture,core,kernel,audit,0.1.6

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, A1, A2, A7). Owner (2026-11-12): "the host-module actually being
modular is extremely important, this is top priority to fix, if the contract has to change thats
fine, but it definitely seems the current implementation is broken from an architecture point of
view." Earlier: 2026-10-01 "If the core is slop it will be impossible to extend it"; 2026-11-04 "I
feel like the modularity of the host modules have been lost somewhere along the way".

## State (2026-11-12)

Done on `fix/modular`, measured in Chromium and Firefox (threads, console, pty, terminal,
process, nena, host-modules, ended-worker, stack, dso, sockets, display, default, shell, core all
pass; image inputs unchanged, `16a63999…`):

- The supervisor and the process Worker name no module. pty raises its signals with
  `dolly_kernel_raise` into the kernel's one queue, which also holds alarms no handler takes, and
  the supervisor drains `dolly_process_take_raised` (it replaces `dolly_process_take_alarm` and
  `dolly_pty_take_signal`/`_taken_signal`). console starts its program through `start`, a callback
  passed to `supervisor.spawn`. The threads provider (`host/threads/threads.mjs`, now with
  `"phase": "kernel"`) owns its contract, its operation numbers and its kernel exports; the
  supervisor and the process Worker get them from it.
- The kernel core calls no module: the display's terminal is two hook tables in the module table,
  `terminal_output` (display) and `terminal_input` (input), which also reach each other through
  them.
- The registry and the site take the build's modules and the switching rule from the manifests
  (`build`, `switches`), not from names. console declares the `pty@0` it is built on.
- `host/README.md` lists every point a module attaches at.

On `fix/batch`, in the batch round (`round/batch-1112`, work/modular):
- `TIOCSWINSZ` is a generic terminal request (`DOLLY_PROCESS_TERMINAL_SIZE_SET`), which the
  kernel hands to the descriptor's stream kind; the libc adapter includes no module header.
- `host/pty/dolly-pty-supervisor-0.wat` is gone.
- Module code left the core: libc's pthreads are `host/threads/pthreads.c` (and
  `pthreads-start.S`), libcurl over http@0 is `host/http/libcurl.c` (a `tools` entry, which the
  curl package sources), the dso and http checks are test fixtures.
- A module's part of the seed is its own script (`seed` in module.json): `host/threads/seed.sh`
  builds the threaded libc into `build/process-sysroot-parts/threads/`, which the sysroot holds
  as `threads/` (where `cc -pthread` looks). build.sh runs every module's.

Decided, not done (audit A1): html@0 and download@0 stay dispatch imports with their own
framing. http@0 stays one too (bulk, streamed), so moving one of the three onto the lease bridge
removes no kind of mechanism and adds lease bookkeeping to its client; download@0 moves bulk
bytes as upload@0 does the other way. The kinds are listed in `host/README.md`.

Left: the drop test after the round, for pty, console (whose kernel part is built on pty's) and
threads: a kernel and runtime built without them boot images that do not declare them.

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
