# Process model

Ordinary commands run in fresh private wasm64 memories. The kernel owns shared
files, open-file descriptions, processes, clocks, terminal state and HTTP.
Processes inherit selected handles and values, never another address space.

## Machine boundary

Each executable imports private shared memory64 and `dolly_process_0.call`,
exports `_start`, and carries matching ABI/memory metadata.
A program supplies its own table, libc and allocator only if needed.
The exact types, stamps, packet layouts and optional DSO profile are described
in the [machine contracts](../abi/README.md).

“Shared” memory enables a trusted multi-memory Wasm gate to copy packets across
Workers; each process still gets a distinct memory object. Requests use bounded
relative ranges and fixed-width fields, not pointers retained by the kernel.
Errors use the pinned target's errno values, not Linux numbering.

A Wasm start section may initialize private memory/TLS, but must not make kernel
calls. Execution begins at `_start`; the C startup object completes TLS
relocations before constructors. Initial memory comes from executable metadata,
with the contract's 8 GiB ceiling.

| Linux concept | Dolly counterpart |
| --- | --- |
| ELF loader / private virtual memory | Stamped Wasm executable / fresh Worker and memory |
| Syscall / kernel VFS | Typed packet gate / kernel WasmFS |
| Descriptor table | Per-process handles to shared kernel descriptions |
| Spawn / waitpid | Instance creation / kernel-owned retirement and status |
| Signals | Kernel pending state, in-Wasm handlers and bounded termination fallback |

This is correspondence, not complete Linux emulation. Fork, process replacement,
threads, raw sockets and job-control groups are unsupported.

## Libc, linking and descriptors

The process sysroot uses pinned Emscripten musl in standalone mode.
`src/process/libc-adapter.c` translates its low-level WASI-shaped calls to
Dolly; final executables do not import WASI or browser libc.

The compiler and Zig are ordinary private processes. C++ uses the real pinned
libc++/libc++abi archives and matching headers installed by `modules/cpp.dm`.
Process-local DSOs share their owner's runtime, allocator, memory and table.
Their loader checks exact provider symbol types before instantiation.
DSO/FFI operations are intercepted in that Worker, not forwarded to a browser
device; missing optional infrastructure returns ENOSYS. Libffi supports CPython
`_ctypes` without an ambient JavaScript import.

Ghostty alone is a resident kernel plugin so terminal state survives foreground
replacement. Its separate closed ABI cannot serve as an ordinary executable
target; see [Ghostty](zig-ghostty.md).

Descriptor flags are per handle; file offsets and status flags belong to shared
open descriptions. Pipe duplicates share O_NONBLOCK: empty reads/full writes
return EAGAIN, and closing all writers gives EOF. FD_CLOEXEC works for files,
pipes and duplicates.

Spawn selects none, standard streams, or all non-CLOEXEC descriptors, then
applies explicit parent-to-child mappings. Sources always refer to the parent,
so swaps are simultaneous. Mappings clear child CLOEXEC without changing the
parent. Closed standard streams stay closed unless mapped.
Python maps `close_fds` and `pass_fds` to this same operation.

`poll` observes regular files, bounded pipes and the in-Wasm tty without
consuming input. Absolute deadlines permit deferred retry; delivered signals
wake it with EINTR. The terminal owns canonical input, echo and independent
OPOST/ONLCR bits. Raw LF is preserved; cooked output can map LF to CRLF.

Advisory file locks are not implemented: valid F_GETLK/F_SETLK/F_SETLKW return
ENOTSUP, and invalid descriptors return EBADF. They never pretend to lock.

## Retirement and failure

The supervisor caches immutable compiled modules by SHA-256 under count/byte
limits, not mutable instances. Retirement drops Worker, memory, gate, listener
and table references before acknowledging a child as waitable. Parent shutdown
retires descendants first.

Unexpected Worker failure produces status 126 and a bounded printable diagnostic.
Compiler launchers retry that infrastructure status up to twice; ordinary
compiler errors return immediately. Failure handled by a parent does not poison
unrelated top-level processes.

Worker termination has no completion event. Large interactive processes receive
a bounded reclamation window before exit is acknowledged, reducing competition
with the recovery shell. This is not a guarantee against browser memory pressure.

## Cancellation

PID/parent IDs and optional spawn cwd are kernel-owned; choosing a child's cwd
does not change the parent's. Positive-PID `kill(pid, 0)` checks existence.
Dolly supports a finite signal set and rejects unsupported signals/action flags.

Wait records distinguish signal termination from ordinary exit. `exit(130)`
is not SIGINT. libc exposes POSIX wait status; `dolly_wait` returns normalized
shell status. **Slop still loses signal information in some lists/pipelines**;
the [handoff](audit-handoff.md#next-fix-shell-cancellation) records the next fix.

Foreground and interactive roles are explicit spawn flags. Only the foreground
tree can transfer ownership; retirement restores its nearest foreground ancestor.
An idle interactive owner receives terminal Ctrl+C, while active descendants get
process SIGINT. Image scripts use `/bin/foreground`; the browser does not
recognize shell, Pi or recovery command names.

The supervisor records signals in the kernel and wakes deferred calls.
Process-local libc delivers handlers at syscall boundaries, supporting masks,
coalescing, re-raising, SA_RESTART, SA_RESETHAND, SA_NODEFER and SA_SIGINFO.
SA_ONSTACK uses the current stack; alternate stacks, asynchronous preemption,
signal-wait operations and general handler-longjmp support are absent.
Handlers remain in Wasm.

Delivery is acknowledged only after a handler returns. An uncooperative process
gets a 500 ms grace period before forced Worker termination. A second terminal
Ctrl+C within one second forces cancellation even if the first was ignored.
The filesystem is not discarded. Kernel/supervisor failure is outside this
per-process guarantee.

SIGCHLD is queued after a retired child is waitable and is nonterminating by
default. Masks defer handlers; waitpid carries child status. SA_NOCLDWAIT is
unsupported. SIGWINCH follows published terminal size changes and has no
termination deadline.

Normal exit runs atexit handlers; default signal termination does not.
Git uses its own signal cleanup. Forced termination/SIGKILL cannot run cleanup:
kernel handles are reclaimed, but named files may remain. Ignored/blocked
signals do not shorten sleeps; delivered handlers interrupt sleep/poll, while
SA_RESTART restarts read/write/wait.

Timed spawns carry absolute monotonic deadlines; the supervisor enforces them
with a browser timer and status 124 even for pure CPU loops without safepoints.
Python `Popen.wait(timeout=...)` instead stops waiting without killing the child.
HTTP polling is nonblocking so runtimes can service timers and cancellation
while waiting for headers or body bytes.
