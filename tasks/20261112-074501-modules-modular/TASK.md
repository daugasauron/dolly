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

Measured, still to do. A kernel built with pty and console dropped from `host/manifests.mjs`
fails before the kernel: the core libc adapter includes `<dolly/pty.h>` for `TIOCSWINSZ`
(`src/process/libc-adapter.c:1578-1588`). These change the seed or the process ABI, so they go
with the next full rebuild round:
- `TIOCSWINSZ` as a generic terminal request in `process.h`, which the kernel hands to the
  descriptor's stream kind (`dolly_kernel_socket_kind.terminal`, as pty already answers).
- `host/pty/dolly-pty-supervisor-0.wat`, empty now, deleted.
- Module code in the core moves to its module: `src/process/threads.c` (libc's pthreads over
  threads@0), `src/libcurl-fetch.c` (http@0), `src/process/http-check.c`, `dso-check.c`.
- The browser channels converge (audit A1): html@0 (packaged) and download@0 (seed) onto the
  leased-device packet; the mailbox modules stay mailboxes (bulk bytes, bounded).
- Then the drop test again, for pty, console and threads, booting images that do not declare them.

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
