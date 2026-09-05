# Dolly process model

Status: implemented and used by every ordinary command and runtime

## Decision

Ordinary commands run as fresh wasm64 module instances with private mutable
state. Dolly's kernel owns the shared filesystem, descriptor descriptions,
process table, clocks, terminal, and network device. A process inherits handles
and values; it never inherits the kernel or another process's address space.

This replaces the version-0 approximation in which Emscripten side modules,
libc, the allocator, and LLVM all occupy one shared memory. Restoring a side
module's data/BSS cannot restore heap allocations, libc internals, LLVM
registries, TLS, the function table, or dynamic-loader state. A fresh instance
removes that class of lifecycle failure by construction.

## Machine layers

```text
browser devices and policy
        |
        | display, snapshot, one HTTP dispatch edge
        v
Dolly kernel Wasm
        |
        | dolly-process-0 packet calls
        v
fresh process Worker + wasm64 instance
        |
        +-- private shared WebAssembly.Memory
        +-- private table, libc, allocator, runtime, globals and TLS
```

The process memory is `shared` only so a trusted multi-memory Wasm gate can
copy bounded packets while the process executes in another Worker. Each process
gets a distinct memory object. Other guest processes never receive it. Kernel
filesystem bytes remain in the kernel's Wasm memory.

The browser loads and terminates Workers but implements no filesystem or POSIX
semantics. A small gate imports both the process memory and kernel memory,
copies pointer-free request/response packets, and synchronizes through an
in-kernel mailbox. This is the WebAssembly equivalent of a kernel copying data
across a syscall boundary. Multiple Memories and Memory64 are standardized
WebAssembly features; Worker creation remains an embedder responsibility.

## Executable contract

`abi/dolly-process-0.wat` is canonical. An executable:

- imports one distinct shared `env.memory` memory64;
- imports only `dolly_process_0.call` as its kernel gate;
- exports `_start() -> ()`;
- carries exactly one matching `dolly.process` ABI digest;
- carries a `dolly.process.memory` record matching the executable's imported
  initial and maximum memory64 page counts;
- defines its own table and statically links its initial libc/runtime;
- has no `dylink.0`, browser, WASI, Fetch, or host-filesystem import.

An executable may contain a WebAssembly start section for private memory/TLS
initialization. Process execution itself begins only when the supervisor calls
the exported `_start`; instantiation must not perform a kernel operation.
Initial memory is executable metadata rather than an ABI-wide constant. Small
commands therefore do not pay for a compiler-sized initial heap, while the
contract still fixes shared memory64 and its 8 GiB ceiling. This corresponds to
loadable-segment and stack requirements in a native executable format.

The call accepts an operation number, a bounded request byte range, and a
bounded response byte range. Packets use fixed-width little-endian fields and
relative offsets rather than pointers. Non-negative results are response byte
counts; negative results are negated POSIX error numbers. The operation and
layout declarations live in `include/dolly/process.h`.

The one gate is analogous to the Linux syscall instruction, not an ambient
host API. The operation set is versioned and closed. In particular, HTTP
operations reach the kernel's existing HTTP mailbox and then the sole outer
`env.dolly_http_dispatch` edge. A compromised process receives no direct
`fetch`, Worker, DOM, socket, or browser object.

Dynamic linking and foreign-function calls are also operations on this one
gate, but they are intercepted inside the calling process Worker. Their
packets contain only offsets in that process's private memory and indices in
its private function table; they never reach the kernel-memory copy gate or a
browser device. This lets wasm64 libffi implement `ffi_call` and callbacks
despite WebAssembly's exact indirect-call types without adding libffi-specific
imports to executables. For callbacks, the Worker constructs a tiny typed Wasm
wrapper that imports only the specific JavaScript closure supplied by the
Worker; it has no memory or browser capability.

## Libc bootstrap

Upstream wasi-libc does not currently support wasm64. The initial Dolly process
sysroot therefore uses the pinned Emscripten musl libc in standalone mode, with
`src/process/libc-adapter.c` providing its low-level WASI calls. The adapter
translates them into `dolly_process_0.call`; the resulting executable does not
import WASI. This is bootstrap input, not a permanent Emscripten loader ABI.

The target is eventually named `wasm64-dolly`. Conventional programs compile
against libc and the sysroot, not against browser APIs or the kernel's internal
filesystem structures. Unchanged upstream configuration should see a serial,
POSIX-like platform with explicit failures for unsupported fork, sockets, and
threads.

`poll(2)` is implemented over a pointer-free readiness packet rather than a
browser or host descriptor. Regular in-Wasm files complete immediately, pipe
readiness follows the kernel's bounded pipe state, and terminal readiness asks
the resident in-Wasm display/input driver without consuming a byte. An
absolute monotonic deadline lets the supervisor defer and retry the same call;
Ctrl-C wakes it with `EINTR`. This is enough for event-driven terminal clients
such as CPython's PyREPL without introducing sockets or asynchronous host I/O.

Upstream libffi 3.5.2 supplies the generic implementation and public wasm64
layout. Dolly replaces only its Emscripten JavaScript-library backend with
`src/runtimes/libffi-dolly.c`, which serializes calls over
`dolly_process_0.call`. CPython's ordinary `_ctypes` module can therefore be
built from upstream source without gaining an ambient JavaScript import.

## Linux correspondence

Linux `execve` installs a new virtual address space while preserving selected
kernel objects such as open file descriptions, credentials, cwd, and the
filesystem namespace. Dolly does the same at the WebAssembly abstraction:

| Linux | Dolly |
| --- | --- |
| ELF executable and loader | stamped wasm64 process module and Worker loader |
| private virtual memory | distinct process `WebAssembly.Memory` |
| syscall instruction | `dolly_process_0.call` through the Wasm gate |
| kernel VFS | kernel-owned WasmFS successor |
| descriptor table | per-process integer handles to kernel descriptions |
| `execve`/`waitpid` | fresh instance start and kernel process result |
| signal delivery | kernel pending signal plus bounded Worker-termination fallback |

Immutable compiled `WebAssembly.Module` objects may be cached by content digest,
just as Linux shares executable code pages. Instances and mutable memory are
never reused by default. The trusted supervisor's cache is SHA-256 keyed,
least-recently-used, and bounded by both entry count and source byte size so a
compromised userspace cannot turn immutable-code reuse into unbounded host
state. On exit or forced termination the supervisor removes the Worker's event
listeners and drops its memory, gate, table-control, and Worker references
before removing the process record. An unexpected Worker failure returns 126
and writes one bounded printable diagnostic to the terminal, rather than
leaving a build tool with only an unexplained exit status.

A failed nested Worker is reported to its direct parent as status 126. It does
not poison the unrelated top-level process after that parent has handled the
status. The small C/C++ compiler launchers retry that infrastructure-only
status up to two times; ordinary compiler diagnostics and all other exit codes
return immediately. This makes long serial source builds resilient to a
transient browser Worker allocation failure without hiding deterministic
source errors.

Browser `Worker.terminate()` has no completion event. After an interactive
root has grown at least 128 MiB, the supervisor therefore drops every Worker,
memory, gate, and listener reference and waits one bounded 500 ms event-loop
window before resolving its exit. This is a lifecycle quiescence point, not a
process or host capability. It prevents an immediately launched recovery shell
from competing with Chromium's still-pending reclamation of a large Pi memory.

## Resident kernel plugin

Ordinary programs never use Emscripten side modules. One source-built Ghostty
display driver remains resident in the kernel address space because terminal
state must survive replacement of foreground processes. It is compiled with
the explicit `--dolly-kernel-plugin` mode, validated against
`abi/dolly-kernel-plugin-0.wat`, stamped, and admitted only while constructing
the sealed system image. This is an internal plugin format, not an executable
format or a general `dlopen` capability.

The main kernel does not contain Clang, LLD, Zig, Slop, or application runtime
code. The compiler is itself a private process. `/bin/cc`, `/bin/c++`,
`/bin/ld`, and `/bin/ar` are small process executables that spawn that compiler
and wait for it. Thus a compiler failure or cancellation reclaims its complete
address space without discarding kernel filesystem state.

## Cancellation

The browser publishes Ctrl-C only for the displayed foreground process tree.
The trusted supervisor records `SIGINT` in the kernel. A process can consume it
through `DOLLY_PROCESS_INTERRUPT_POLL`; a deferred syscall is woken with
`EINTR`. If the process exits without consuming the signal, the kernel
overrides its ordinary exit code with status 130. If it never polls, exits, or
handles the signal within the short grace period, the supervisor terminates
that process Worker and the kernel reports status 130. This is the availability
backstop that a cooperative signal implementation alone cannot provide.

Timed spawns carry an absolute monotonic deadline in the spawn packet. The
kernel remains authoritative for the value and exposes only the remaining
duration to the trusted supervisor. The supervisor arms a browser timer for the
corresponding Worker and forcibly terminates it with status 124 at expiry. The
process also receives the deadline through ordinary blocking calls and
interrupt polls so cooperative programs can stop cleanly first. A pure CPU loop
therefore cannot defeat `timeout` merely by omitting safepoints.
