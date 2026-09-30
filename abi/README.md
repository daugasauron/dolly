# Machine contracts

The WAT files here are the canonical source of Dolly's exact Wasm boundaries.
C headers in `include/dolly/`, such as [`process.h`](../include/dolly/process.h),
define packet layouts above them; generated JSON is linker input only. The comments in each
WAT file document its semantics.

| Contract | Boundary |
| --- | --- |
| [`dolly-process-0.wat`](dolly-process-0.wat) | Ordinary executables: private shared memory64, one import `dolly_process_0.call`, export `_start` |
| [`dolly-process-gate-0.wat`](dolly-process-gate-0.wat) | Policy-free copier between a process memory and the kernel mailbox |
| [`dolly-process-dso-0.wat`](dolly-process-dso-0.wat) | Optional process-local shared objects and FFI infrastructure |
| [`host/threads/dolly-threads-0.wat`](../host/threads/dolly-threads-0.wat), [`host/threads/dolly-threads-supervisor-0.wat`](../host/threads/dolly-threads-supervisor-0.wat) | Optional `-pthread` profile and its supervisor exports |
| [`dolly-host-0.wat`](dolly-host-0.wat) | `dolly.host` records naming required host modules; no authority |
| [`host/gpu/dolly-gpu-0.wat`](../host/gpu/dolly-gpu-0.wat), [`host/audio/dolly-audio-0.wat`](../host/audio/dolly-audio-0.wat) | Additive process operations 128 and 129 and their browser imports |
| [`dolly-kernel-plugin-0.wat`](dolly-kernel-plugin-0.wat) | The resident display plugin; never an ordinary program target |
| [`dolly-browser-0.wat`](dolly-browser-0.wat) | The complete typed outer import allowlist of the kernel |
| [`dolly-supervisor-0.wat`](dolly-supervisor-0.wat) | Kernel exports the trusted supervisor uses |
| [`host/display/dolly-display-0.wat`](../host/display/dolly-display-0.wat), [`host/http/dolly-http-0.wat`](../host/http/dolly-http-0.wat), [`host/download/dolly-download-0.wat`](../host/download/dolly-download-0.wat), [`host/upload/dolly-upload-0.wat`](../host/upload/dolly-upload-0.wat), [`host/snapshot/dolly-snapshot-0.wat`](../host/snapshot/dolly-snapshot-0.wat) | Browser-facing mailboxes and dispatch imports |

A contract makes a boundary reviewable and lets the build derive retained exports
exactly; listing a function does not make it guest authority.

Architecture and authority: [architecture](../docs/architecture.md),
[process model](../docs/process-model.md), [browser boundary](../docs/browser-boundary.md).

## Process executables

```wat
(import "env" "memory" (memory i64 1 131072 shared))
(import "dolly_process_0" "call"
  (func (param i32 i64 i64 i64 i64) (result i64)))
;; operation, request address/size, response address/capacity
```

- Exactly those imports and `_start() -> ()`; no `dylink.0`, WASI, Fetch, DOM or
  filesystem import. A program supplies its own table, libc or allocator only if
  it needs them.
- One `dolly.process` section holds the contract digest; one
  `dolly.process.memory` section holds initial and maximum pages.
- The digest covers the contract's typed imports and exports and the SHA-256 of
  the exact bytes of [`process.h`](../include/dolly/process.h). Identity hashes exact
  bytes, so every opcode, flag or layout change necessarily changes it; no
  normalizer decides which edits are prose.
- [`generate-abi-constants.mjs`](../scripts/generate-abi-constants.mjs) derives
  JavaScript constants from `process.h` and from the WAT exported globals;
  `dist/dolly-errno.mjs` comes from the pinned target's `<errno.h>`.

## Enforcement

[`dolly-abi.mjs`](../scripts/dolly-abi.mjs) performs the checks; the build
([`build.sh`](../scripts/build.sh)) links to a temporary file, validates,
stamps, validates again and publishes atomically:

```sh
node scripts/dolly-abi.mjs validate-process build/dolly-process-0.wasm build/process-bin/ls
node scripts/dolly-abi.mjs validate-runtime build/dolly-kernel-plugin-0.wasm dist/dolly.wasm
node scripts/dolly-abi.mjs validate-browser build/dolly-browser-0.wasm dist/dolly.wasm
```

The browser repeats the executable checks before instantiation with the same
parser and validator ([`wasm-interface.mjs`](../src/wasm-interface.mjs),
[`process-abi.mjs`](../src/process-abi.mjs)). The compiled WAT contract supplies
the expected types; a digest stamp alone does not establish compatibility. This
is defense in depth; host containment rests on the kernel's outer imports.

## Changing a contract

Any typed import or export, opcode, packet field, pointer width, memory limit or
lifecycle rule is an ABI change. Update the WAT, the C header, both
implementations, the contract tests and a real-browser test together. A digest
change invalidates old executables, image caches, sessions and snapshots.
