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
- supplies its own table, libc, or runtime only when the program needs them;
- has no `dylink.0`, browser, WASI, Fetch, or host-filesystem import.

`src/process-abi.mjs` checks actual byte-level types, stamps, and memory records
at both build-time validation and browser admission. A freestanding `_start`
does not need libc or a dynamic-link namespace. DSO/FFI operations fail with
target `ENOSYS` if their optional runtime infrastructure is absent. Browser
error numbers are generated from the target headers, not copied from Linux.

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

The optional dynamic-link profile is `abi/dolly-process-dso-0.wat`. Static
infrastructure and initialization-hook types are checked by the same validator
in build tools and the browser. The loader checks resolved function/tag types
against parsed provider exports before allocation, including self imports that
need a deferred wrapper. Direct and GOT resolution both prefer local definitions
(`-Bsymbolic`). GOT entries carry pointer types, not full function signatures;
`dlsym` and FFI callers remain responsible for their declarations.

## Libc bootstrap

Upstream wasi-libc does not currently support wasm64. The initial Dolly process
sysroot therefore uses the pinned Emscripten musl libc in standalone mode, with
`src/process/libc-adapter.c` providing its low-level WASI calls. The adapter
translates them into `dolly_process_0.call`; the resulting executable does not
import WASI. This is bootstrap input, not a permanent Emscripten loader ABI.

Each process owns its descriptor flags separately from shared open-file offsets
and status flags. Pipe `O_NONBLOCK` is shared by duplicates of the same end;
empty reads and full writes return `EAGAIN`, while closing all writers gives
EOF. `pipe2`, `fcntl` and `FIONBIO` use the existing descriptor operations.
`FD_CLOEXEC` works for files, pipes and duplicates. Spawn
selects no inherited descriptors, standard streams, or all open non-CLOEXEC
descriptors, then applies explicit parent-to-child mappings. Mappings clear
child CLOEXEC without changing the parent; sources always refer to the parent,
so swaps are simultaneous. Closed standard streams remain closed unless mapped.
The existing C stdio convenience calls map only their three explicit streams;
Python maps `close_fds` and `pass_fds` onto this same kernel operation. The
packet layout is bound into the process ABI digest; it adds no browser import.

The same SDK supplies genuine pinned libc++/libc++abi archives. `c++`, explicit
`-lc++`/`-lc++abi`, and their `-Wl,` forms select that one process runtime, even
when linking C++ objects with `cc`. A process hosting DSOs exports the runtime;
its libraries import it instead of creating another allocator or exception
state. `modules/cpp.dm` installs the matching headers and declares these actual
archives. Resident kernel plugins have no C++ runtime: freestanding C++ can
compile, but remaining imports must fit the kernel ABI and requesting process
C++ libraries explicitly fails.

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
| spawn / `waitpid` | fresh instance start and kernel result; positive-PID `WNOHANG` leaves a running child unreaped; process replacement is not implemented |
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

The process packet contract includes actual PID/parent IDs, an optional absolute
spawn cwd, nonblocking wait, and positive-PID signals. Selecting a child's cwd
is atomic in the kernel and never changes the parent's cwd. `kill(pid, 0)` checks
existence; HUP, INT, QUIT, ABRT, KILL, PIPE and TERM are supported. Groups and
stopped states are not implemented; unsupported signals fail with ENOTSUP.
SIGKILL and signals before Worker entry terminate without handlers. These
operations do not address native host processes.

Exit and wait records carry a separate termination-signal field. A normal
`exit(130)` is an ordinary exit; it is not inferred to be SIGINT. libc translates
the records to POSIX wait status, while `dolly_wait` retains normalized shell
status for existing callers. The supervisor WAT contract also types the explicit
signal argument for forced termination.

An exited child is not waitable until the trusted supervisor has dropped its
Worker, memory and gate references and acknowledged retirement. Parent shutdown
retires descendants first. Large interactive processes get one bounded browser
reclamation window before that acknowledgment; Worker termination itself has no
completion event. This applies equally to nested and root processes.

PID/parent identity is immutable within one private process and cached in its
libc adapter. Its sole thread has the same TID as PID. Both the libc thread record
and shared-memory stdio locking use that identity; retaining Emscripten's fallback
TID would deadlock `flockfile` followed by ordinary locked stdio operations.
This is separate from advisory file locks: `F_GETLK`, `F_SETLK` and `F_SETLKW`
return `ENOTSUP` for valid descriptors and `EBADF` for invalid ones. They never
pretend to acquire a lock.

HTTP_POLL also returns immediately: a zero-ready response means no chunk is
available yet. Runtimes can therefore service timers and issue HTTP_CANCEL while
waiting for headers or body bytes. The synchronous C performer waits between
pending polls; no additional browser import or communication path is involved.

The browser publishes Ctrl-C only for the displayed foreground process tree.
Foreground and interactive roles are explicit spawn flags, owned by the kernel.
Only the current foreground tree can transfer ownership to a child; retirement
restores its nearest foreground ancestor. An interactive owner receives terminal
Ctrl-C when idle, while its active descendants receive process-directed SIGINT.
An ordinary foreground job is itself cancellable. Image-owned init scripts use
the ordinary `/bin/foreground` launcher to select these roles; the browser does
not recognize Slop, Pi or recovery paths.
The trusted supervisor records signals in the kernel and wakes deferred calls
with `EINTR`. The process-local libc wrapper delivers pending signals at syscall
boundaries through ordinary `signal`/`sigaction` handlers. It supports masks,
pending/coalesced signals, re-raising, SA_RESTART, SA_RESETHAND, SA_NODEFER and
SA_SIGINFO. SA_ONSTACK uses the current stack; alternate stacks are unavailable.
Handler calls stay in Wasm; no handler function enters JavaScript.
Unsupported action flags fail explicitly. There is no asynchronous stack
preemption, alternate signal stack, signal-wait operations, or general
handler-longjmp support.

Polling a signal begins delivery; `SIGNAL_ACKNOWLEDGE` completes it after the
handler returns. A handler stuck in a CPU loop therefore cannot cancel the
500 ms termination deadline merely by receiving its signal. A parent exiting
during a foreground-tree interrupt waits for signalled children to finish their
own handlers under their own deadlines. A second terminal Ctrl-C within one
second forcibly cancels the job even if its handler ignores the first.
The page never reloads or discards the filesystem to cancel a job. A failure of
the kernel/supervisor itself is outside this per-process cancellation guarantee.

Normal `exit` runs atexit callbacks. Default signal termination does not; programs
such as Git use their own registered signal cleanup handlers. A handler may
explicitly call `exit`, or restore the default disposition and re-raise to keep
a signal termination status. Forced Worker termination/SIGKILL cannot run
application cleanup: kernel resources are reclaimed, but named user files may
remain. Ignored or blocked signals do not shorten sleeps; a delivered handler
interrupts sleep/poll, while SA_RESTART restarts read/write/wait calls.

Timed spawns carry an absolute monotonic deadline in the spawn packet. The
kernel remains authoritative for the value and exposes only the remaining
duration to the trusted supervisor. The supervisor arms a browser timer for the
corresponding Worker and forcibly terminates it with status 124 at expiry. A pure
CPU loop cannot defeat `timeout` merely by omitting safepoints. A Python
`Popen.wait(timeout=...)` is different: it stops waiting without killing the
child; callers can then signal it and collect the result.
