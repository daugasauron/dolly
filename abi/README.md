# Dolly ABI

`dolly-0.wat` is the canonical machine-level contract between Dolly and a
command module. It is deliberately WebAssembly rather than a parallel metadata
schema:

- its imports are the facilities a command is allowed to import;
- its exports are the entry points every command must export;
- function signatures, globals, mutability, memory64, and table64 are encoded
using their actual WebAssembly types.

`dolly-terminal-0.wat` separately defines the browser-facing terminal device:
its shared memory and output imports, its blocking shell entry point, and its
versioned in-memory mailbox layout. Keeping this separate prevents worker/UI
transport mechanics from becoming command capabilities.

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

The build creates `build/dolly-0.wasm` and `build/dolly-terminal-0.wasm` from
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
that boundary rather than silently expanding the runtime. Four callable symbols
have generated Emscripten loader providers rather than native-Wasm providers:
the typed `invoke_jj`, `invoke_ijj`, `invoke_ijji`, and `invoke_vjj` trampolines,
which catch longjmp transfer around indirect calls. Source
compilation maps ISO C `exit()` to `dolly_exit`; the runtime catches it at the
nested command boundary and returns its status to `wait` without terminating
the worker. It similarly maps `fclose()` to a lifecycle-aware wrapper: ordinary
files close normally, while inherited standard streams flush without destroying
the shell's shared libc streams.

`dolly-http-0.wat` defines the separate browser-facing streaming network
mailbox. Commands see only typed `dolly_http_perform` request/response structs
and `dolly_http_response_dispose` in `dolly-0`; the browser sees only a dispatch
notification plus the shared mailbox, not Dolly's filesystem or descriptors.

This single dispatch import is also the intended autonomous network security
edge. Its JavaScript provider, not code inside the shared-everything userspace,
owns origin, credential, redirect, quota, and approval policy. The threat model
deliberately assumes total userspace compromise; see
[`docs/security.md`](../docs/security.md).

The compiler engine in `src/compiler.cpp` applies the corresponding frontend and
LLD settings from inside the main Wasm module. The `/bin/cc` and `/bin/c++`
modules call it through the typed `dolly_toolchain_main` entry. Before publishing
arbitrary linked output, the engine parses both that module and the in-Wasm copy
of `dolly-0` with LLVM's Wasm object reader and applies the same typed import,
export, infrastructure, and loader-relocation checks as the external validator.

Commands and the runtime carry a `dolly.abi` custom section containing a SHA-256
digest of the contract's normalized typed interface. Binary layout, comments,
and import ordering do not affect the digest. A module stamped for another
contract is rejected before its imports are considered.
