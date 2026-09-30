# Architecture

Dolly is a POSIX-like userspace inside one browser tab. A Wasm kernel owns all
mutable state, ordinary commands run as private wasm64 processes, and trusted
browser code supplies a fixed set of host modules. Design rules are in
[AGENTS.md](../AGENTS.md); exact Wasm contracts are in [abi/](../abi/README.md).

```mermaid
flowchart LR
  subgraph page["Page: trusted JavaScript"]
    broker["HTTP broker + policy"]
    ui["browser.mjs + host modules<br/>canvas, input, Save, downloads"]
  end
  subgraph runtime["Runtime Worker"]
    kernel["Kernel dolly.wasm<br/>WasmFS, descriptors, processes, tty"]
    ghostty["Ghostty display plugin"]
    supervisor["Process supervisor"]
  end
  subgraph procs["Process Workers"]
    proc["At most 32 processes<br/>private memory64<br/>one import: dolly_process_0.call"]
  end
  proc -- "syscall packet" --> supervisor
  supervisor -- "gate copy + dispatch" --> kernel
  kernel --- ghostty
  kernel -- "host-module mailboxes and imports" --> ui
  kernel -- "env.dolly_http_dispatch" --> broker
  broker -- "Fetch" --> net(("network"))
```

| Part | Code | Role |
| --- | --- | --- |
| Page | [`browser.mjs`](../src/browser.mjs), [`terminal.html`](../terminal.html) | Boots one route, owns canvas, keyboard, clipboard and Save |
| Host modules | [`host/modules.mjs`](../src/host/modules.mjs) | Fixed registry of browser providers; see [browser boundary](browser-boundary.md) |
| Runtime Worker | [`runtime-worker.mjs`](../src/runtime-worker.mjs) | Loads the kernel, restores or builds the image, runs its ENTRY |
| Kernel | [`dolly.c`](../src/dolly.c), [`process-kernel.c`](../src/process-kernel.c), [`system-snapshot.c`](../src/system-snapshot.c), [`session-snapshot.c`](../src/session-snapshot.c) | WasmFS, open files, pipes, processes, signals, terminal, HTTP slots, snapshots ([build](../toolchain/CMakeLists.txt)) |
| Supervisor | [`process-supervisor.mjs`](../src/process-supervisor.mjs) | Compiles executables, gives each process a fresh memory, gate and Worker (one per thread), forwards syscalls, enforces deadlines |
| Process Worker | [`process-worker.mjs`](../src/process-worker.mjs), [`process-ffi.mjs`](../src/process-ffi.mjs) | Instantiates the executable; loads process-local DSOs and FFI |
| Process libc | [`libc-adapter.c`](../src/process/libc-adapter.c), [`signal.c`](../src/process/signal.c) | Maps Emscripten musl's low-level calls to process operations |
| Display | [`ghostty/display.c`](../src/ghostty/display.c), [`kernel-plugin.mjs`](../src/kernel-plugin.mjs) | Resident terminal emulator and rasterizer; see [display](display.md) |

## Decisions

- **Serial execution is intentional.** Slop runs one command at a time,
  pipeline stages included; Make `-jN` and Ninja run one job. Compiler recipes
  and agent tools then behave predictably without a scheduler, host processes or
  async callbacks. Every process is a fresh Worker and memory, and Worker
  termination has no completion event, so concurrent processes would multiply
  memory pressure in one tab.
- **One user, no permission bits.** Every process is the same principal and the
  containment boundary is the browser, so modes would protect nothing. Execute
  bits never select programs; `chmod` and `chown` check that the path exists
  and change nothing.

## System calls

Every kernel request is one bounded packet through the process's single import.

```mermaid
sequenceDiagram
  participant P as C program
  participant L as musl + libc adapter
  participant W as Process Worker
  participant S as Supervisor
  participant G as Gate
  participant K as Kernel
  P->>L: read(fd, buf, n)
  L->>W: dolly_process_0.call(op, request, response)
  W->>S: postMessage, then Atomics.wait
  S->>G: request(): copy packet into the kernel mailbox
  S->>K: dolly_process_dispatch(pid, op, sizes)
  K-->>S: response size, -errno or deferred
  Note over S,K: deferred calls retry when the kernel wakes them
  S->>G: response(): copy reply into process memory
  S-->>W: Atomics.store + notify
  W-->>L: result
  L-->>P: bytes read or -1/errno
```

- Packets are at most 1 MiB, use fixed-width little-endian fields and relative
  ranges, never pointers ([`process.h`](../include/dolly/process.h)).
- The gate ([`dolly-process-gate-0.wat`](../abi/dolly-process-gate-0.wat)) is a
  policy-free multi-memory copier; bounds failures trap.
- Errors are negated errno values of the pinned target libc, not Linux numbers.
- A pending signal turns the next call into `-EINTR`; libc then runs the handler
  ([process model](process-model.md)).

## Images

An image is a sealed snapshot of retained files, environment and an ENTRY
program, built from a [Dollyfile](dollyfile.md). Core images:

```mermaid
flowchart TD
  seed["compiler seed<br/>dist/dolly.data"] -- "root build" --> sb["system-build<br/>cc, sbase, make, tar"]
  sb --> st["system-tools<br/>git, curl, awk, /bin/sh"]
  sb --> gb["ghostty-build<br/>Zig, Ghostty"]
  st --> sys["system<br/>display, sessions"]
  gb -. "COPY plugin + font" .-> sys
  sys --> def["default"]
  sys --> gpu["gpu-sdk"]
  sys --> audio["audio-sdk"]
  demos["demos/*"]
  sb -.-> demos
  st -.-> demos
  sys -.-> demos
```

- Recipes: [`Dollyfile-system-build`](../Dollyfile-system-build),
  [`Dollyfile-system-tools`](../Dollyfile-system-tools),
  [`Dollyfile-ghostty-build`](../Dollyfile-ghostty-build),
  [`Dollyfile-system`](../Dollyfile-system), [`Dollyfile`](../Dollyfile) (default),
  [`Dollyfile-gpu-sdk`](../Dollyfile-gpu-sdk), [`Dollyfile-audio-sdk`](../Dollyfile-audio-sdk);
  their modules live in `modules/`.
- The graph is split so an edit rebuilds only its descendants: each builder
  starts from the smallest image with its tools. Neither Git nor display
  packaging is an input to the Rust producers (`rust-sdk` starts from
  `system-build`); CMake, Neovim and SDL build from `system-tools` without
  display or Rust.
- Toolchains stay in build-only images; shipped images copy their exact outputs,
  as `system` copies Ghostty's plugin and font without the Zig SDK
  ([Dollyfile](dollyfile.md#building)).
- Prebuilt boot restores a sealed snapshot without downloading the compiler seed
  or compiling anything.
- Demos build `FROM` core images; the core never uses a demo.
- The kernel's WasmFS is the only filesystem. Browser storage holds only opaque
  image snapshots and [sessions](sessions.md); nothing is mounted.

## Filesystem layout

| Path | Contents |
| --- | --- |
| `/bin`, `/usr/bin` | Slop, core commands, tools and runtimes |
| `/usr/include`, `/usr/lib` | Headers, libraries, retained runtimes |
| `/usr/src` | Source retained by images |
| `/etc/dolly` | Image identity, ENTRY record, startup scripts |
| `/home/dolly` | `HOME` |
| `/workspace`, `/tmp` | Scratch; never retained in images |
| `/seed` | Compiler seed, root rebuilds only |
| `/run` | Volatile files, excluded from sessions |
