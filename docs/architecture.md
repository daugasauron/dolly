# Architecture

Dolly is a POSIX-like userspace, not Linux emulation. The compile target is the
interface: exact Wasm types, packet layouts, files and lifecycle semantics.
Design constraints live in AGENTS.md; exact contracts live in [abi/](../abi/README.md).

```text
trusted browser: fixed assets, Worker scheduling, bounded devices, HTTP policy
                                │
Wasm kernel: filesystem, descriptors, environments, processes, tty, HTTP mailbox
                                │
                  typed, pointer-free process gate
                                │
private Wasm processes: Slop, compilers, runtimes, tools, games
```

## Processes and tools

Every ordinary command is a `dolly-process-0` executable with a private
memory and one typed call import. Each spawn gets a fresh Worker and runtime
state; kernel files and inherited descriptors survive process replacement.
A multi-memory Wasm gate copies bounded packets, not host objects or pointers.

Executable files are found through `PATH`; supported `#!` scripts resolve
absolute in-Wasm interpreters. Execution does not depend on permission bits.
The libc adapter translates Emscripten musl's low-level calls to Dolly operations;
final programs do not import WASI or Emscripten's browser API.

The bootstrap `readlink("/proc/self/exe")` query returns the kernel-recorded
canonical path of the loaded image, including a shebang's interpreter. Changes
to argv, cwd or the file after loading do not change this identity. This narrow
compatibility query does not expose a general `/proc` filesystem.

Clang/LLD/LLVM run in a private compiler executable behind `cc`, `c++`,
`ld` and `ar`. Zig is separate and installed only in `ghostty-build`.
C++ and process-local DSOs share their owning process's memory/table, not the
kernel's. See [process semantics](process-model.md).

The kernel owns spawn/wait, pipes and signals. The supervisor can terminate an
uncooperative Worker without discarding the filesystem. Fork, native threads,
raw sockets and complete POSIX job control are unsupported. Serial execution is
intentional; known shell cancellation gaps are in the [handoff](audit-handoff.md).

## Images and files

The kernel's in-memory WasmFS is the only filesystem. Browser storage is never
mounted. Descriptors are per-process handles to kernel-owned files or pipes.

[Dollyfile 3](dollyfile.md) executes in Wasm, row by row. Modules build ordinary
programs from pinned source; images retain explicit outputs and environment.
Completed images, not modules, are cached. `FROM` and `COPY` reuse verified
image artifacts.

A root rebuild starts with externally bootstrapped kernel/compiler bytes and a
runner that compiles Slop and the Dollyfile executor. Derived rebuilds use their
declared base. Prebuilt boot restores a sealed snapshot without downloading the
compiler seed or compiling sources. [Sources](sources.md) records the exceptions.

Named [sessions](sessions.md) save filesystem deltas against an exact base
image, not process memory. Standard mutable workspace, temporary and Pi auth/
session paths are excluded from system snapshots; this is not a general secret
scanner. Unsaved state disappears when the tab is closed.

## Display and browser authority

Ghostty is the one resident kernel plugin. Its narrow loader accepts WasmFS
bytes and links an explicit kernel export map; it cannot fetch dependencies or
evaluate JavaScript. System images copy its finished plugin, font and licenses
from `ghostty-build` without retaining the Zig SDK.

Bootstrap progress uses a plain-text sink. Once Ghostty loads, VT parsing,
scrollback, selection and font rasterization run in Wasm; the browser blits
checked RGBA. Foreground graphics programs can lease the display and return it
on exit. See [display](display.md).

Private processes improve recovery, not the host-containment thesis. Assume
the entire Wasm userspace is compromised. The trusted outer imports and their
browser implementations are the security perimeter. HTTP uses one explicit
broker; other crossings are bounded devices and user file/session operations.
The [review map](browser-boundary.md) identifies their implementation, and the
[security model](security.md) explains their authority.
