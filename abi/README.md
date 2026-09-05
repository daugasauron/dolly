# Dolly machine contracts

The WAT files in this directory are the inspectable source of Dolly's exact
WebAssembly boundaries. C headers define packet layouts above those typed Wasm
edges. Generated JSON is linker input only; it is never an ABI definition.

## Ordinary process executables

`dolly-process-0.wat` is the public compile target for programs. A process
executable:

- imports one private, shared memory64 as `env.memory`;
- imports exactly one function, `dolly_process_0.call`;
- exports `_start() -> ()`;
- carries one `dolly.process` custom section with the contract digest;
- carries one `dolly.process.memory` section with its initial and maximum page
  counts; and
- has no `dylink.0`, WASI, Fetch, DOM, filesystem, or browser import.

The digest includes the typed WAT interface and the SHA-256 bound into the
contract's `dolly.process.layout` section. That latter digest is calculated
from the exact bytes of `include/dolly/process.h`, so changing an opcode or
packet layout necessarily changes executable identity.

The single call has this type:

```wat
(import "dolly_process_0" "call"
  (func (param i32 i64 i64 i64 i64) (result i64)))
;; operation, request address/size, response address/capacity
```

Requests and responses contain fixed-width little-endian values and relative
byte ranges, never process pointers for the kernel to retain. Non-negative
results are response byte counts; negative values are negated POSIX errno
values. `INT64_MIN` means the call is deferred until its resource becomes
ready.

The process supervisor creates a fresh Worker, memory, table, libc, allocator,
and module instance for every execution. `dolly-process-gate-0.wat` is a
policy-free multi-memory copier between that process memory and the one kernel
mailbox. Bounds failures trap. Files, descriptors, environment, cwd, pipes,
process records, clocks, terminal operations, and HTTP mediation remain kernel
state in Wasm memory.

Process-local shared objects use Emscripten's `dylink.0` encoding internally,
but carry `dolly.process.dso`, share only their owning process's memory/table,
and are validated by `process-worker.mjs`. They are not kernel plugins and add
no machine import.

## Resident kernel plugin

`dolly-kernel-plugin-0.wat` is a separate internal contract for the one module
that must survive process replacement: the Ghostty display driver. It lists
the exact memory64/table64 relocation infrastructure and libc functions that
driver imports. It has no command entry point.

Only `cc --dolly-kernel-plugin -shared` can produce this format. The compiler
validates it against the contract, adds one `dolly.abi` digest, validates it
again, and publishes it atomically. The image build seals the result before the
kernel loads it. Ordinary programs never compile against this contract.

## Kernel and browser contracts

- `dolly-supervisor-0.wat` describes the typed functions trusted Worker code
  uses to schedule private processes, copy executable bytes, deliver signals,
  and collect status.
- `dolly-display-0.wat` describes the shared RGBA/input mailbox and the one
  bootstrap text sink.
- `dolly-http-0.wat` describes the streaming HTTP mailbox. Its
  `env.dolly_http_dispatch` import is Dolly's sole intentional
  agent-selected network edge.
- `dolly-download-0.wat` describes an explicit, bounded local-user file
  download.
- `dolly-snapshot-0.wat` describes opaque system/session snapshot staging and
  bootstrap operations.

These contracts do not imply that each function is guest authority. They make
the browser/runtime boundary reviewable and let the build derive the main
module's retained exports exactly.

## Build enforcement

`scripts/dolly-abi.mjs` performs the mechanical checks:

```sh
node scripts/dolly-abi.mjs inspect build/dolly-process-0.wasm
node scripts/dolly-abi.mjs validate-process \
  build/dolly-process-0.wasm build/process-bin/ls
node scripts/dolly-abi.mjs validate-runtime \
  build/dolly-kernel-plugin-0.wasm dist/dolly.wasm
```

The build sequence is fail-closed:

1. assemble the WAT contract;
2. bind `process.h` into the process contract;
3. derive digest headers/modules and the Emscripten export list;
4. link to a temporary output;
5. validate, stamp, validate again;
6. publish the complete file; and
7. verify the final main-module browser import allowlist.

The browser supervisor repeats executable stamp/import/export/memory checks
before instantiation. The process Worker repeats DSO checks before local
loading. Compatibility validation is defense in depth; host containment still
rests on the main runtime's outer browser imports.

## Changing a contract

Treat any typed import/export, opcode, packet field, pointer width, memory
limit, or lifecycle rule as an ABI change. Update the WAT, C layout header,
both sides of the implementation, static contract tests, real browser tests,
and documentation together. A digest change intentionally invalidates old
executables, module-cache layers, sessions, and snapshots.
