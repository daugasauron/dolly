# Architecture

Dolly is a modular POSIX-ish userspace inside one browser tab. A Wasm kernel owns all
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
    proc["At most 56 processes<br/>private memory64<br/>one import: dolly_process_0.call"]
  end
  proc -- "gate copy into its mailbox" --> kernel
  proc -- "syscall" --> supervisor
  supervisor -- "dispatch" --> kernel
  kernel --- ghostty
  kernel -- "host-module mailboxes and imports" --> ui
  kernel -- "env.dolly_http_dispatch" --> broker
  broker -- "Fetch" --> net(("network"))
```

| Part | Code | Role |
| --- | --- | --- |
| Page | [`browser.mjs`](../src/browser.mjs), [`site.mjs`](../src/site.mjs), [`terminal.html`](../terminal.html) | Boots an image (`boot()`, the embedding's) or a route of the site, which may build one; gives host modules its canvas, keyboard and status line |
| Host modules | [`host/`](../host/README.md) | One directory and manifest per bridge: JavaScript provider, WAT contract, C header, kernel C, process client; see [browser boundary](browser-boundary.md) |
| Runtime Worker | [`worker-image.mjs`](../src/worker-image.mjs), [`runtime-worker.mjs`](../src/runtime-worker.mjs), [`build-worker.mjs`](../src/build-worker.mjs) | Instantiates the kernel with the host modules' imports, restores the image from its packs, or, for the site, builds it or restores a custom one, and runs its ENTRY |
| Kernel | [`dolly.c`](../src/dolly.c), [`process-kernel.c`](../src/process-kernel.c), [`system-snapshot.c`](../src/system-snapshot.c), [`file-blocks.cpp`](../src/file-blocks.cpp) | WasmFS, open files, pipes, processes, signals, terminal modes, image snapshots; module operations go to each module's `kernel.c` ([build](../toolchain/CMakeLists.txt)) |
| Supervisor | [`process-supervisor.mjs`](../src/process-supervisor.mjs) | Compiles executables, gives each process a Worker (one per thread) and each Worker a mailbox in kernel memory, dispatches syscalls, enforces deadlines |
| Process Worker | [`process-worker.mjs`](../src/process-worker.mjs) | Makes the process's memory and gate, instantiates the executable, copies each packet between that memory and its mailbox and enters the kernel for it; for an executable that records `dso@0`, imports the loader and FFI ([`host/dso/process.mjs`](../host/dso/process.mjs)) |
| Process libc | [`libc-adapter.c`](../src/process/libc-adapter.c), [`signal.c`](../src/process/signal.c) | Maps Emscripten musl's low-level calls to process operations |
| Kernel libc | [`libc-host.c`](../src/libc-host.c) | Answers what Emscripten musl and WasmFS ask of a host from the kernel's own imports |
| Display | [`host/display/kernel.c`](../host/display/kernel.c), [`ghostty/display.c`](../src/ghostty/display.c), [`kernel-plugin.mjs`](../src/kernel-plugin.mjs) | The terminal device's output and the framebuffer lease; resident terminal emulator and rasterizer; see [display](display.md) |
| Input | [`host/input/kernel.c`](../host/input/kernel.c), [`host/input/input.mjs`](../host/input/input.mjs) | The record ring, the input lease and the terminal's reader; see [input](input.md) |

## Decisions

- **Slop is serial; programs run in parallel.** Slop is one process without
  threads or a scheduler: what it runs itself (builtins, functions, compound
  commands, substitutions) runs one at a time. Programs are separate
  processes: those of a [pipeline](slop.md#pipelines-and-interrupts) and those
  started with `&` run at the same time. Build tools use several cores:
  `posix_spawn` returns without waiting, each child runs in its own Worker, and
  only the kernel's system call dispatch stays serial. Make `-jN` with its
  jobserver, Ninja and `xargs -P N` use this. Every process is a fresh Worker
  and memory, and Worker termination has no completion event, so `N` multiplies
  memory pressure in one tab.
- **One user, no permission bits.** Every process is the same principal and the
  containment boundary is the browser, so modes would protect nothing. Execute
  bits never select programs; the `chmod` and `chown` calls check that the path
  exists and change nothing.

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
  W->>G: request(): copy packet into the Worker's mailbox
  W->>S: postMessage, then Atomics.wait
  S->>K: dolly_process_dispatch(pid, op, sizes)
  K-->>S: response size, -errno or deferred
  Note over S,K: deferred calls retry when the kernel wakes them
  S-->>W: Atomics.store + notify
  W->>G: response(): copy reply into process memory
  W-->>L: result
  L-->>P: bytes read or -1/errno
```

- Packets are at most 1 MiB, use fixed-width little-endian fields and relative
  ranges, never pointers ([`process.h`](../include/dolly/process.h)).
- The gate ([`dolly-process-gate-0.wat`](../abi/dolly-process-gate-0.wat)) is a
  policy-free multi-memory copier; bounds failures trap. Each Worker holds its
  own instance and a 1 MiB mailbox in kernel memory, registered with the kernel
  when the Worker starts (`dolly_process_worker_mailbox`), so a process's
  memory is held by its Workers alone and goes when they end; the runtime
  Worker never holds one, since a living Worker drops a shared memory only when
  it collects garbage ([process model](process-model.md#spawn-and-wait)).
- Errors are negated `dolly_process_error` numbers of `process.h`, part of the
  hashed contract; a libc maps its `errno` to them.
  A malformed packet is one of them, never the end of the process.
- A pending signal turns the next call into `-EINTR`; libc then runs the handler
  ([process model](process-model.md)).

## Images

An image is a sealed snapshot of retained files, environment and an ENTRY
program, built from a [Dollyfile](dollyfile.md). Core images:

```mermaid
flowchart TD
  seed["compiler seed<br/>dist/dolly.data"] -- "root build" --> sb["system-build<br/>cc, Slop, core tools, make, tar"]
  sb --> zb["zig-build<br/>Zig"]
  zb --> gb["ghostty-build<br/>Ghostty"]
  gb -. "COPY plugin + font" .-> disp["display<br/>package"]
  sb --> st["system-tools<br/>sbase, awk, /bin/sh"]
  sb -. "packages: zlib, gzip, curl, git" .-> st
  disp -. "INSTALL" .-> st
  st --> sys["system<br/>sessions"]
  sb -. "packages: transfer" .-> sys
  sb -. "packages: core, curl, nena, amy, transfer" .-> def["default<br/>packages only"]
  st -. "packages: posix" .-> def
  disp -. "INSTALL" .-> def
  demos["demos/*"]
  sb -.-> demos
  st -.-> demos
  sys -.-> demos
```

- Recipes: [`Dollyfile-system-build`](../Dollyfile-system-build),
  [`Dollyfile-system-tools`](../Dollyfile-system-tools),
  [`Dollyfile-zig-build`](../Dollyfile-zig-build),
  [`Dollyfile-ghostty-build`](../Dollyfile-ghostty-build),
  [`Dollyfile-display`](../Dollyfile-display),
  [`Dollyfile-system`](../Dollyfile-system), [`Dollyfile`](../Dollyfile) (default);
- An edit rebuilds its descendants: each builder starts from the smallest
  image with its tools. `default` has no base: it installs packages, each
  built in `system-build` or `system-tools`. `system-tools` installs the
  `display` package, so Zig and Ghostty are inputs to everything built from
  it (CMake, Neovim, SDL), and the `git` package, since builds patch with it;
  `rust-sdk` starts from `system-build` and installs `display` as well.
  A package built on `system-build`, such as `amy` or `transfer`, reaches
  only the images that install it.
- Toolchains stay in images that are only built; applications and packages keep
  exact outputs, as the `display` package copies Ghostty's plugin and font
  without the Zig SDK and `pi-runtime` installs the `janis` package
  ([Dollyfile](dollyfile.md#building)).
- Prebuilt boot restores a sealed snapshot without downloading the compiler seed
  or compiling anything.
- Demos build `FROM` core images; the core never uses a demo.
- The kernel's WasmFS is the only filesystem. Browser storage holds only opaque
  image snapshots, the packs images were read from and [sessions](sessions.md);
  nothing is mounted but a build's inputs: each image the build reads is a
  file of `/etc/dolly/artifacts` that takes no write and whose bytes stay in
  the Worker.
- File bytes live in kernel memory in 1 MiB blocks. A write that memory cannot
  hold fails with `ENOSPC` and leaves 128 MiB for the kernel to keep working.

## Filesystem layout

| Path | Contents |
| --- | --- |
| `/bin`, `/usr/bin` | Slop, core commands, tools and runtimes |
| `/usr/include`, `/usr/lib` | Headers, libraries, retained runtimes |
| `/usr/src` | Source retained by images |
| `/etc/dolly` | Image identity, ENTRY record, startup scripts |
| `/home/dolly` | `HOME` |
| `/workspace`, `/tmp` | Scratch; never retained in images |
| `/run` | Volatile files, excluded from sessions |
