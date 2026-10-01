# JavaScript

QuickJS-ng is the engine; Janis adds a finite Node-compatible surface over Dolly's
files, processes and HTTP. Neither is native Node. The adapters receive no
browser Worker, Fetch, socket or host-process handle.

Replacing the engine would not remove the need for Node adapters. Revisit it only
for an engine-level incompatibility, not a missing adapter; a replacement must use
Dolly's filesystem and network boundary and pass repeated-invocation and
cancellation tests.

## Images

- `javascript`: QuickJS, Janis and TypeScript, as a package.
- `typescript-build`: QuickJS, Janis and the TypeScript compiler build.

`janis`, `tsc` and `qjs` (a link to `janis`) are ordinary programs;
`typescript-build` compiles them headless on `system-tools` and the `javascript`
package keeps them for `INSTALL` (`pi-runtime`, `bhop`, `slopyard`) and
`amy install javascript`.

## Supported

- ESM, CommonJS and JSON modules, package `imports`/`exports` and conditions,
  `import.meta.resolve`, resolved only inside WasmFS; missing modules fail.
- Descriptor-based `fs` with positioned I/O and promise wrappers; open files
  survive rename and unlink.
- Buffers, encodings, paths, URLs, events, timers, crypto helpers, tty streams
  and stateful UTF-8 decoders ([`dolly-node.js`](dolly-node.js)).
- `child_process` with pipe-backed stdio, exit codes versus signals, kill and
  timeouts; `fetch()` over the HTTP broker with streaming bodies and abort. One
  cooperative event pump serves promises, timers, HTTP and child pipes.

## Key files

- [`quickjs-main.c`](quickjs-main.c), [`janis.c`](janis.c),
  [`janis.js`](janis.js), [`dolly-node.js`](dolly-node.js): the runtime.
- [`Dollyfile-typescript-build`](Dollyfile-typescript-build), [`Dollyfile-typescript-build`](Dollyfile-typescript-build),
  [`tsc-dolly.mjs`](tsc-dolly.mjs): builds; QuickJS's ambient
  `quickjs-libc.c` is excluded.
- Tests: [`test/`](test/).

## Limits

- No npm client, native addons, worker threads or nested WebAssembly.
- Only three stdio descriptors; detached processes and IPC fail.
- `os.cpus`, `os.totalmem`/`freemem` and `process.memoryUsage` fail with
  `ENOSYS`. `chmod` reaches the kernel, which checks the path and changes nothing.
- `redirect: "manual"` is rejected; response chunks are buffered eagerly.

Test: `npm run test:demos -- javascript` ([`test/`](test/)).
