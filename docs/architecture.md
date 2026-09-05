# Architecture

## Thesis

Dolly is a small POSIX-like userspace for coding agents, not Linux emulation.
Programs get the conventional things that make source ports useful—arguments,
environment, files, descriptors, cwd, clocks, entropy, pipes, spawn/wait,
terminal I/O, dynamic libraries, and HTTP—through a defined wasm64 compile
target.

The target is the product. Browser wrappers and individual language adapters
can change; the machine contract, data layout, filesystem semantics, and
lifecycle rules must remain small, typed, inspectable, and versioned.

## Topology

```text
trusted browser embedding
  ├─ fixed application assets and snapshot bytes
  ├─ Worker lifecycle
  ├─ raw user input + checked RGBA canvas blit
  ├─ explicit local-user file download
  └─ env.dolly_http_dispatch  (only agent-selected network edge)
                    │
                    ▼
kernel Wasm memory64 instance
  ├─ in-memory WasmFS, cwd, environments and descriptors
  ├─ process table, pipes, clocks, entropy mediation and signals
  ├─ terminal/display state and HTTP mailbox
  └─ one sealed resident Ghostty display plugin
                    │
          pointer-free packet syscall
                    │
                    ▼
fresh private process Worker
  ├─ executable's own shared memory64 and table
  ├─ statically linked libc, allocator, globals and TLS
  └─ optional process-local DSOs
```

The browser is the embedder and device provider, not the OS implementation.
Filesystem and process semantics stay in Wasm. A trusted multi-memory Wasm gate
copies bounded packets between one process memory and the kernel mailbox.

## Executables and lifecycle

Every command, shell, compiler, build tool, language runtime, Pi instance, and
game is a `dolly-process-0` executable. It imports only a private `env.memory`
and `dolly_process_0.call`, then exports `_start`. The supervisor constructs a
fresh instance for every spawn and discards its complete address space on exit.

This mirrors the useful property of Linux `execve`: user memory is new while
kernel objects survive. Dolly preserves selected descriptor descriptions, cwd,
environment values, filesystem state, parent/child records, and exit status in
the kernel. It does not try to snapshot and reset libc or LLVM globals inside a
shared address space.

Regular files beginning with `#!` are the second executable form. The kernel
accepts a bounded line containing an absolute in-Wasm interpreter and at most
one optional argument, rewrites argv conventionally, and repeats normal Wasm
loading. It cannot name a host executable.

Execution does not depend on Unix permission bits. `PATH` resolution finds a
regular Wasm executable or supported shebang file; ownership and chmod are not
security mechanisms in Dolly.

Ctrl-C targets the foreground process tree. The kernel records `SIGINT`, wakes
a deferred call with `EINTR`, and exposes a cooperative poll. The trusted
supervisor forcibly terminates a Worker after a 500 ms grace period if code
does not reach a safepoint. Status 130 and descriptor/display cleanup remain
kernel-owned, so the shell and filesystem survive a hung compiler or program.

## Platform substrate

`include/dolly/process.h` defines the closed operation set and packet layouts:

- argument and environment transfer;
- descriptor read/write/seek/stat/sync/dup/pipe/directory operations and
  deadline-bounded readiness polling;
- path open/stat/create/remove/rename/link/symlink/readlink/cwd operations;
- clock, sleep, entropy, terminal and explicit download operations;
- spawn, wait, signal polling and exit;
- streaming HTTP; and
- exclusive framebuffer lease operations.

The initial libc is pinned Emscripten musl compiled in standalone wasm64 mode.
`src/process/libc-adapter.c` translates its low-level WASI-shaped calls into the
single Dolly process call, so final executables do not import WASI. This is a
bootstrap implementation below the public libc API, not a promise that
Emscripten's JavaScript ABI is Dolly's platform.

Raw sockets deliberately fail inside the process runtime. HTTP libraries use
the typed kernel operations, which alone reach the browser broker. Fork and
threads are absent; serialized process-shaped behavior is preferred whenever
that is enough for agent tooling.

## Compiler and C++

Clang 24, LLD, the Zig frontend bridge, and LLVM live in one ordinary private
compiler executable. The main kernel does not link them. Small `/bin/cc`,
`/bin/c++`, `/bin/ld`, `/bin/ar`, and `/usr/bin/zig` frontends spawn it through
the same process API as every other program.

The driver reads and writes only kernel-backed filesystem paths. It links the
process adapter, libc, allocator, compiler builtins, and (for C++) libc++,
libc++abi, and unwind support. Final executables are validated and stamped
before atomic publication. A failed or cancelled compilation loses only the
compiler process memory.

Process-local DSOs share the owning executable's memory/table and resolve
against its exported libc/C++/application namespace. Dolly's source-built
libffi translates `ffi_call` and closure operations inside the same Worker,
which is sufficient for CPython `_ctypes` without another browser import.

One deliberately different format exists: a sealed resident kernel plugin for
Ghostty's terminal driver. It is compiled only with
`--dolly-kernel-plugin -shared` against the narrow
`dolly-kernel-plugin-0` contract. It is not available as an ordinary command
format.

## Filesystem and image construction

The root filesystem is an in-memory WasmFS backend owned by the kernel. Browser
storage is never mounted. Process descriptor numbers map to per-process kernel
records; copied descriptors may reference the same in-Wasm open file or pipe.

Each source-visible Dollyfile selects pinned `.dm` modules. `/rebuild/` runs a
C Dollyfile engine inside a private process. It handles rows strictly in order:
fetch one authorized source, verify SHA-256, write it into WasmFS, execute its
Slop command, check outputs, clean temporary state, then continue. Completed
module output layers may be cached under exact content-derived keys; partial
modules are never published.

The first private bootstrap process compiles Slop, the Dollyfile engine, and
the tiny compiler frontends from retained source. Everything else is built by
the chosen module graph. The prebuilt route restores the resulting sealed
system snapshot; it does not replay the build or fetch source archives.

## Terminal and graphics

Before Ghostty exists, a bootstrap-only browser callback displays plain build
progress. After the source-built driver loads, terminal bytes, VT parsing,
scrollback, selection, paste rules, font rasterization, and the cell grid stay
inside the kernel Wasm instance. The browser validates metadata and blits one
complete RGBA buffer; it does not parse escape sequences.

A foreground process can lease the framebuffer through process opcodes. Its
pixels remain in private process memory until copied in bounded chunks through
the gate into an inactive kernel frame. Present swaps only a complete checked
frame. Exit, SIGINT, or Worker failure releases the lease and restores the
resident terminal. Programs receive semantic input records, never DOM or
Canvas objects.

## Network and containment

Assume total compromise of all in-Wasm state. The host-security perimeter is
the import closure of the main runtime and the trusted browser implementations
behind it. Private process memories improve correctness and availability; they
are not required for the containment thesis.

`env.dolly_http_dispatch` is the sole intentional agent-selected network
import. A compromised userspace can format arbitrary method, URL, headers, and
body for that broker, so origin, path, credential-header, redirect, quota,
timeout, and approval policy must be enforced browser-side. No in-Wasm check is
trusted for egress policy.

Other browser crossings are narrow device or explicit-user channels: raw
input, checked pixels, bootstrap text, fixed assets, entropy/clocks, named
opaque session bytes, and an explicit local file download. The complete threat
model and allowlist requirements are in [security.md](security.md).

## Snapshots and sessions

System snapshots are immutable deployment artifacts bound to the runtime build
ID, exact recipe chain, module identities, entry record, retained manifest,
length, and SHA-256. Mutable `/workspace`, credentials, and `/tmp` are excluded.

Named sessions are explicit opaque filesystem serializations stored in
same-origin IndexedDB. The guest gets no storage API or host path. A session is
restored only when its runtime/image identity matches; closing an unsaved tab
destroys its mutable state.

## Deliberate limitations

- wasm64, shared memory, multiple memories, and Workers are required;
- no native host filesystem, process, socket, DOM, or ambient Fetch capability;
- no fork, threads, multiprocessing, or performance-oriented parallel make;
- serialized pipes and process scheduling are acceptable;
- raw TCP/UDP software is out of scope unless represented by a future explicit
  broker contract; and
- the resident display plugin is an internal bootstrap exception, not a second
  general application ABI.

See [the ABI reference](../abi/README.md), [process model](process-model.md),
[security model](security.md), [Dollyfile language](dollyfile.md), and
[roadmap](roadmap.md).
