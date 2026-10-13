# JavaScript

QuickJS-ng is the engine; Janis adds a finite Node-compatible surface over Dolly's
files, processes and HTTP. Neither is native Node. The adapters receive no
browser Worker, Fetch, socket or host-process handle.

Replacing the engine would not remove the need for Node adapters. Revisit it only
for an engine-level incompatibility, not a missing adapter; a replacement must use
Dolly's filesystem and network boundary and pass repeated-invocation and
cancellation tests.

## Images

- `quickjs`: `qjs` and the QuickJS-ng engine as a library (`-lquickjs`, `quickjs.h`): upstream's own command with its `std` and `os` modules, and nothing of Node.
- `janis`: `janis`, QuickJS with a Node-compatible surface: `janis FILE.js` runs Node-style programs, and there is no `node`.
- `typescript`: TypeScript's `tsc`, run by Janis.

Each package holds its own build on `system-tools`, and each is built on the
one before: `quickjs` compiles upstream's engine and `qjs` from the pinned
checkout, as upstream's `CMakeLists.txt` does; `janis` installs `quickjs` and
links Dolly's runner on its library; `typescript` installs `janis` and adds
Microsoft's npm archive. A recipe or `amy install` that names one gets the
ones below it.

A C program that is one script links the runner, `-ldolly-js -lquickjs` with
[`quickjs-runner.h`](quickjs-runner.h): `tsc`, `pi` and the games' agents are
such programs. The archive is in `janis` because every program linked with it
reads Janis's two scripts when it starts.

## Supported

- ESM, CommonJS and JSON modules, package `imports`/`exports` and conditions,
  `import.meta.resolve`, resolved only inside WasmFS; missing modules fail.
  As in Node, a file, `-e` or stdin runs as CommonJS unless `.mjs`, package
  `type` or import syntax makes it ESM. Built-in modules and ESM views of
  CommonJS are generated in memory.
- `Intl`: CLDR en-US date, number (standard, compact, percent) and relative
  time formatting in the clock's zone, plus `Segmenter` and `Locale`;
  QuickJS has no ICU, so other locales resolve to en-US and unsupported
  options throw `RangeError`.
- `process.exit` cannot be caught. Uncaught errors and unhandled rejections
  reach `process` listeners or fail the process. Errno errors carry Node's messages, stacks start with the
  message, and runtime frames read `node:internal/janis`.
- Descriptor-based `fs` with positioned I/O and promise wrappers; open files
  survive rename and unlink. Dolly has no change notification, so `fs.watch`
  polls metadata every second and `fs.watchFile` at its interval.
- Buffers, encodings, paths, URLs, events, timers, crypto helpers, tty streams
  and stateful UTF-8 decoders ([`dolly-node.js`](dolly-node.js)).
- `child_process` with pipe-backed stdio, exit codes versus signals, kill and
  timeouts; `fetch()` over the HTTP broker with streaming bodies and abort;
  WHATWG streams with `pipeTo`, `pipeThrough` and transformers. One
  cooperative event pump serves promises, timers, HTTP and child pipes.

## Key files

- [`quickjs-main.c`](quickjs-main.c), [`janis.c`](janis.c),
  [`janis.js`](janis.js), [`dolly-node.js`](dolly-node.js): the runtime.
- [`Dollyfile-quickjs`](Dollyfile-quickjs), [`Dollyfile-janis`](Dollyfile-janis),
  [`Dollyfile-typescript`](Dollyfile-typescript), [`tsc-dolly.mjs`](tsc-dolly.mjs):
  builds. Upstream's `quickjs-libc.c` (`std`, `os`) is in `qjs` and not in Janis.
- Tests: [`test/`](test/).

## Limits

- `qjs` is upstream's command and has none of what follows `janis` here: its
  modules are upstream's `std`, `os` and `bjson` (`--std`). Built with
  upstream's switch for a target without threads, it has no `os.Worker`,
  `os.exec` fails (nothing forks) and `os.platform` is `js`.
- No npm client, native addons, worker threads (constructing a `Worker` fails
  with `ENOSYS`) or nested WebAssembly. Requiring an ES module fails with
  `ERR_REQUIRE_ESM`.
- Only three stdio descriptors; detached processes and IPC fail.
- `os.cpus`, `os.totalmem`/`freemem` and `process.memoryUsage` fail with
  `ENOSYS`. `chmod` reaches the kernel, which checks the path and changes nothing.
- `redirect: "manual"` is rejected; response chunks are buffered eagerly.
- Readable streams other than stdin are push-only. `fs.rmdir`'s deprecated `recursive`,
  `createWriteStream`'s `start`, `COPYFILE_FICLONE_FORCE` and `structuredClone`'s
  `transfer` fail explicitly.

Test: `npm run test:demos -- javascript` ([`test/`](test/)).
[`node-oracle.mjs`](test/fixtures/node-oracle.mjs) runs the same API cases in Node
and in Janis and requires identical results.
