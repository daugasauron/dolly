# Host modules that are modules: the core names none of them, a module plugs in by generic hooks

- STATUS: OPEN
- PRIORITY: 450
- TAGS: host-modules,architecture,core,kernel,audit,0.1.6

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, A1, A2, A7). Owner (2026-11-12): "the host-module actually being
modular is extremely important, this is top priority to fix, if the contract has to change thats
fine, but it definitely seems the current implementation is broken from an architecture point of
view." Earlier: 2026-10-01 "If the core is slop it will be impossible to extend it"; 2026-11-04 "I
feel like the modularity of the host modules have been lost somewhere along the way".

## State (2026-11-13, seed round)

`fix/seed-hygiene` is merged with main on `round/0.1.6-seed` (65de9b568): x11-window, which main
added, includes display@0's and input@0's headers and now uses their packages, as godot and
photocraft do. The ABI tool needs no module's file (7ff68cc32): `validate-process-dso` was
`scripts/dolly-abi.mjs`'s one use of `host/dso/interface.mjs` and dso's fixtures hook its one
caller, which now calls the loader's validator itself; nothing in `scripts/`, `page/`, `site/`,
`kernel/` or `process/` imports from `host/dso/` (grep).

Left, for a compiler round: the seed compiler (`programs/compiler.cpp`) still names modules:
`host_client_libraries` skips `libdolly-sockets.a` and `libdolly-pty.a` (844-845), `-rdynamic`
adds `--export=__dolly_dso_allocate` (893-894), `-pthread` links the `/threads` part and exports
`dolly_thread_start` (861, 889, 928). Decided for that round: a `requested` module's package
installs its archive in `/usr/lib`, which `-L/usr/lib` finds and the auto-linked
`/usr/lib/dolly/process` does not hold, so the scan names nothing; the `-rdynamic` and `-pthread`
exports come from files in the process sysroot that `scripts/build.sh` writes from the dso and
threads manifests, as `-rdynamic` reads its provider symbols from a file already. It takes the
compiler rebuilt in Dolly from `demos/llvm`, restamped and pinned (`docs/sources.md`).

## State (2026-11-13)

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

The drop test (2026-11-13, on main's code with the console id fix, `work/audit`): with pty@0 and
console@0 out of `host/manifests.mjs`, the runtime builds (image inputs `63a92c02…`: their headers
leave the seed), `default`'s closure builds on that seed (18 images), and `default` boots in
Chromium and Firefox with its shell, pipelines and files working and neither module among the
page's (`runtime display download http input nena packages snapshot upload`). With threads@0 out
as well, the image build stops: `Dollyfile-system-build` sources `host/threads/threads.h` and its
ABI header, which are then no trusted input. system-build installs and exports by name the headers
of the modules whose clients are in the seed (http, display, input, download, upload, threads,
dso), and fifteen recipes assert them by name (`REQUIRES HEADER http`, ...); `scripts/build.sh`
also names sockets and pty when it lists the clients the runtime library links.
Left: the core recipe without module names: each such module's headers in a package of its own
(as gpu@0's are in libdolly-gpu), which the recipes that compile against them install, so a module
leaves the repository with its package; and build.sh's client list from the manifests.
On `fix/seed-hygiene` (2026-11-13, work/seedwork: e0528e0e2, 570f670a5, c566ac0a4, 5a855d797;
image inputs `2ee43eaf…` before, `98bc4c57…` after; the suites of the hygiene task pass on it):
- A module's header and client reach programs through its package, as gpu@0's do:
  `Dollyfile-libdolly-{display,input,download,upload,nena,packages,pty}` are new; threads@0's
  header is `Dollyfile-libdolly-threads` and its client went into its part of the seed
  (`host/threads/seed.sh`), the threaded libc that `cc -pthread` links and the one place it is
  linked. `Dollyfile-system-build` sources and exports no module's header. The seed holds two
  modules' headers and clients, by the manifests (no `package`): http@0's, with which the recipe
  engine downloads before any recipe runs, and dso@0's, whose loader `cc -rdynamic` exports
  (`--export=__dolly_dso_allocate` in `src/compiler.cpp`, the pinned seed compiler).
- The recipes that compile against them install them: `system` (display, input, download, upload,
  threads: the modules it declares, so what is built FROM it has them, the suites' fixtures among
  it), `ghostty-build` (display, input), `sdl2` and `wine-build`; `transfer`, `nena`, `amy`,
  `godot`, `godot-editor`, `photocraft`, `janis`, `tmux`, `xterm`, `voice` and `ghostty-gtk`
  `USE` theirs. Nothing exports `HEADER http` or `dso` now, so the rows requiring them went (amy,
  curl, python, libffi, janis). The demo recipes are edited, not built here.
- `scripts/build.sh` takes the clients `cc` links unasked from the manifests: `requested` on
  sockets and pty (`host-modules.mjs links`); the unused `DOLLY_CLIENT_LIBRARIES` is gone.
  Still naming modules, in the seed compiler (a compiler round, `docs/sources.md`):
  `src/compiler.cpp:844-845` (`libdolly-sockets.a`, `libdolly-pty.a`), `-rdynamic`'s dso export
  and `-pthread`'s `threads/` part and `dolly_thread_start` export.
- dso@0's contract fixtures are its manifest's `fixtures` (`test/build-dso-fixtures.mjs`, which
  now stamps and validates them too), which build.sh runs for every module, and the image build ID
  covers the process-side contracts the manifests name (`write-build-id.mjs`), where both named
  dso: with dso out of the manifests the runtime build stopped at `validate-process-dso`
  (`ENOENT build/dolly-dso-0.wasm`, `build/seedwork-drop-dso-before.log`).
- No contract changed (the kernel's and the process ABI are as they were): Donna needs nothing.

The drop test, measured (`build/seedwork-drop*.log`): console, pty, dso, stack and sockets out of
`host/manifests.mjs`, the runtime builds (its kernel module table without pty, sockets and console,
`dist/` without their contracts, the seed's `/usr/include/dolly` with http's alone, image inputs
`6a7e498d…`), and default's and system's closures build from it. default boots: the default suite
passes but its `amy list` step, which fails without the drop too (the runtime Worker bundle's
`src/images.mjs`, `20261112-090000-audit-startup`); the core, shell, threads and terminal suites
pass in Chromium and Firefox; the process suite stops at its dso checks (`dist/dolly-dso-0.wasm`),
which test the dropped module. threads@0 is not droppable from default's closure: git, in
system-tools, links `-pthread` and declares it.

Left: the seed compiler's names (above), for its next round; `scripts/dolly-abi.mjs` imports
`host/dso/interface.mjs`, so the dso directory cannot leave before that check moves with it.

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
