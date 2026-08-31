# Dolly ABI

`dolly-0.wat` is the canonical machine-level contract between Dolly and a
command module. It is deliberately WebAssembly rather than a parallel metadata
schema:

- its imports are the facilities a command is allowed to import;
- its exports are the entry points every command must export;
- function signatures, globals, mutability, memory64, and table64 are encoded
using their actual WebAssembly types.

`dolly-display-0.wat` separately defines the browser-facing display/input
device: shared memory, the temporary bootstrap text sink, bounded input-event
records, double-buffered RGBA addresses, command-result words, and the blocking
shell entry point. Keeping it separate prevents worker/UI transport mechanics
from becoming command capabilities. Once the resident display driver is live,
ordinary terminal output never calls the browser text sink.

`dolly-snapshot-0.wat` defines two opaque snapshot boundaries. Static system
images use direct staging exports during boot. Named user sessions use a
fixed shared-memory chunk mailbox: Wasm walks and restores WasmFS, while the
page only compresses and persists uninterpreted bytes. Neither path adds a
browser import.

The contract module is a schema and is never instantiated. `scripts/dolly-abi.mjs`
assembles and consumes it as follows:

```text
command imports  ⊆ contract imports + loader relocation conventions
contract imports ⊆ runtime exports or loader relocation facilities
contract exports ⊆ command exports
```

A Dolly executable is therefore a WebAssembly binary, not a shell registration:
it has `dylink.0` dynamic-linking metadata, imports the shared wasm64 machine and
the contract facilities it actually uses, exports `dolly_main`, and carries the
`dolly.abi` digest. Its directory and basename only participate in `PATH`
lookup. Version 0 deliberately has no execute-bit or permission metadata.

`env.memory` is a shared wasm64 memory. The worker loader creates it explicitly
because the UI must notify terminal input while the runtime blocks; mutable
filesystem, descriptor, terminal, and process state still resides in that
WebAssembly memory. `env.__indirect_function_table` completes the shared
address space. `__memory_base` and `__table_base` are assigned per module by the dynamic
loader. `GOT.func` and `GOT.mem` are the mutable relocation slots used by
Emscripten's dynamic-linking convention. A `GOT.func.foo` slot is derived from
the typed `env.foo` function declaration rather than duplicated in the
contract. A module may also import a GOT slot for one of its own exported
functions or address globals; these self-relocations are link mechanics, not
Dolly capabilities.

A side module may have a WebAssembly start section. Real dynamic objects use it
for tasks such as zeroing relocated BSS before constructors run. The start code
still executes inside the shared WebAssembly address space and gains no imports
beyond those checked by this contract.

The build creates `build/dolly-0.wasm`, `build/dolly-display-0.wasm`, and
`build/dolly-snapshot-0.wasm` from
the WAT schemas and validates every command and the runtime. It also creates
`build/runtime-exports.json` because Emscripten's `EXPORTED_FUNCTIONS` setting
requires that syntax. That JSON file is derived build glue, not an ABI source.
The same tool emits `build/generated/dolly-abi-digest.h` from the normalized WAT
interface. The in-Wasm linker appends those bytes as the `dolly.abi` section of
commands it creates; no JSON manifest participates in runtime compilation.

The source-level half of the contract remains the compiler sysroot and
`include/dolly/abi.h`. The Wasm contract records how that C/C++ interface is
lowered; it does not replace declarations, layouts, constants, or the C++ ABI.

`bin/dolly-cc` and `bin/dolly-c++` apply the current wasm64 side-module settings
and invoke the validator after every command link. Unsupported imports fail at
that boundary rather than silently expanding the runtime. Five callable symbols
have generated Emscripten loader providers rather than native-Wasm providers:
the typed `invoke_v`, `invoke_jj`, `invoke_ijj`, `invoke_ijji`, and `invoke_vjj`
trampolines, which catch longjmp transfer around indirect calls. Source
compilation maps ISO C `exit()` to `dolly_exit`; the runtime catches it at the
nested command boundary and returns its status to `wait` without terminating
the worker. It similarly maps `fclose()` to a lifecycle-aware wrapper: ordinary
files close normally, while inherited standard streams flush without destroying
the shell's shared libc streams.

The target also inserts SanitizerCoverage edge callbacks as cooperative
cancellation safepoints. The callback is implemented inside the runtime and
checks a PID-targeted interrupt sequence in the display mailbox; it is not a
browser import or ambient capability. A pending foreground `SIGINT` unwinds the
current nested command and becomes status 130. Blocking terminal, HTTP, and
sleep operations contain explicit checkpoints, and QuickJS uses its native
interpreter interrupt hook. This is deliberately the useful default `SIGINT`
action rather than a complete signal/process-group implementation.

`-fdolly-runtime-interrupt-handler` is the narrow opt-out for a language
runtime that supplies such a hook. It removes compiler edge callbacks so the
runtime can convert the interrupt into its own exception, unwind, and release
its heap before returning 130. QuickJS uses it; ordinary C/C++ programs retain
the default edge safepoints. Using the option without polling
`dolly_interrupt_poll()` makes CPU-bound code non-cancellable and is a target
contract violation even though it does not expand browser authority.

The target similarly maps `isatty()` to `dolly_isatty()`. Dolly tracks standard
stream identity as process bookkeeping: spawn derives a child TTY mask from the
parent descriptors and its redirections, then restores the parent mask. Regular
redirected files and serial pipeline spools are false. This provides the TTY
distinction applications need without adding native ioctl or browser terminal
imports.

`dolly-http-0.wat` defines the separate browser-facing streaming network
mailbox. Synchronous C clients use typed `dolly_http_perform` request/response
structs, while language event loops use `dolly_http_start` and nonblocking
`dolly_http_poll` over the same one-request mailbox. The browser sees only a
dispatch notification plus the shared mailbox, not Dolly's filesystem or
descriptors.

This single dispatch import is also the intended autonomous network security
edge. Its JavaScript provider, not code inside the shared-everything userspace,
owns origin, credential, redirect, quota, and approval policy. The threat model
deliberately assumes total userspace compromise; see
[`docs/security.md`](../docs/security.md).

The display contract is deliberately device-shaped rather than a terminal
emulator API. The browser writes fixed-size key/text/resize/pointer records and
bounded explicit-paste bytes, and reads only a published frame plus a bounded
active-selection copy buffer. Ghostty parsing, paste encoding, selection,
mode-aware key encoding, font loading, rasterization, and terminal state are
implementation details inside the shared userspace. System clipboard access
remains gated by local browser paste/copy gestures.

The compiler engine in `src/compiler.cpp` applies the corresponding frontend and
LLD settings from inside the main Wasm module. The `/bin/cc` and `/bin/c++`
modules call it through the typed `dolly_toolchain_main` entry. Before publishing
arbitrary linked output, the engine parses both that module and the in-Wasm copy
of `dolly-0` with LLVM's Wasm object reader and applies the same typed import,
export, infrastructure, and loader-relocation checks as the external validator.
The runtime invokes the same validator, plus an exact single-stamp check, again
for every filesystem executable and the display driver immediately before
dynamic loading.

Commands and the runtime carry a `dolly.abi` custom section containing a SHA-256
digest of the contract's normalized typed interface. Binary layout, comments,
and import ordering do not affect the digest. A module stamped for another
contract is rejected before its imports are considered.
