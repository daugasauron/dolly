# JavaScript runtime

QuickJS-ng is the ECMAScript engine. Janis supplies a finite Node-compatible
surface over Dolly's files, lifecycle and HTTP. Neither is native Node.

```text
QuickJS-ng + Janis node:* adapters → dolly-process-0 → Wasm kernel
```

`qjs`, `janis`, `tsc` and `pi` are ordinary WasmFS programs.
Pi's TypeScript is emitted inside Dolly and loaded unbundled; see
[Pi](pi-agent-plan.md) for build and package policy.
Replacing the JavaScript engine would not remove the need for Node adapters.

## Supported behavior

- ESM/CommonJS/JSON, package imports/exports and conditions, package scopes,
  `import.meta.resolve` and deterministic `fs.globSync`.
- Real descriptor-based files, positioned I/O, stat/lstat/fstat, and Promise
  wrappers. Open files survive rename/unlink.
- Buffers, encoding, paths/URLs, events, timers, crypto helpers and tty streams.
- A serial event pump for Promise jobs, HTTP and child-process pipes.

Module resolution is confined to WasmFS. Missing packages, files, exports and
builtin adapters fail; resolution never fetches code or calls a host loader.
There is no npm client, native addon, worker thread or nested WebAssembly engine.
Pi's Photon resize dependency is consequently excluded.

## Child processes and HTTP

`child_process.spawn` immediately creates a child with a PID, cwd/environment
and pipe-backed stdin/stdout/stderr. The event pump feeds input, drains output
and checks nonblocking wait. Exit codes and signal termination are distinct.
Kill, abort and timeout stop the child; synchronous helpers collect the same
pipes with bounded output.

Only three stdio descriptors and Dolly's finite signal set are supported.
Detached processes, identities and IPC fail. Unref stops keeping the parent's
event loop alive; descendants are still disposed when their parent exits.

Fetch uses nonblocking Dolly HTTP operations. Abort before headers, during
response reading, or through reader cancellation releases the operation.
These adapters receive no browser Worker, Fetch, socket or host-process handle.
HTTP limits and eager buffering are documented in [HTTP](http.md).

## Text streams

`src/runtimes/dolly-node.js` owns one stateful UTF-8 decoder implementation.
Each TextDecoder, StringDecoder, stdin/readable and child-output stream has
separate state. Split scalars, byte views, flushing, fatal errors and BOM rules
are supported. Node-style strings retain BOMs; TextDecoder/Response.text strip
an initial BOM by default.

StringDecoder supports UTF-8 only. Its malformed-input timing may differ from
Node while producing the same final text. Binary writes remain bytes.

```sh
node --test test/utf8.test.mjs
DOLLY_IMAGE=pi DOLLY_BROWSER_MODE=utf8 ./scripts/test-browser.sh
```

Only revisit the engine when an engine-level incompatibility, rather than a
missing runtime adapter, warrants it. Any replacement must use Dolly's existing
filesystem/network boundary and pass repeated-invocation and cancellation tests.
