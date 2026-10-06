# Host modules

A host module is one bridge between the Wasm userspace and the browser, in one
directory. [`manifests.mjs`](manifests.mjs) lists the modules; each
`NAME/module.json` names every file of its module, and the registry, build,
packaging and ABI tests read only these manifests.

```json
{ "name": "http", "version": 0, "dependencies": ["runtime@0"], "phase": "kernel",
  "imports": ["env.dolly_http_dispatch"], "host": "http.mjs",
  "contracts": ["dolly-http-0.wat"], "process": [], "headers": ["http.h", "http-abi.h"],
  "kernel": ["kernel.c"], "client": ["client.c"] }
```

| Field | Meaning |
| --- | --- |
| `name`, `version` | The requirement `name@version` that images (`REQUIRES HOST`) and executables (`dolly.host` records) name |
| `provides` | `"kernel"` on a runtime (below); absent otherwise |
| `dependencies` | Modules this one uses through `get(name)` |
| `phase` | When the Worker side starts: after the kernel loads (`kernel`) or after the image is restored (`image`) |
| `imports` | Kernel Wasm imports this module provides; `abi/dolly-browser-0.wat` is their reviewed allowlist |
| `host` | Trusted JavaScript: `check()`, `browser()` and `worker()` sides ([`modules.mjs`](modules.mjs)); a module with a client exports the `digest` it implements |
| `processWorker` | Trusted JavaScript served inside the process Worker, bundled as `dist/dolly-process-NAME.mjs`; only `dso` has one (below) |
| `contracts` | WAT of the kernel boundary: its exports are kernel exports, its imports the host's |
| `process` | WAT of process-side ABIs, such as the threads entry point |
| `headers` | C API and packets, installed as `<dolly/NAME.h>`; `NAME-abi.h` is generated from the WAT constants and carries the module's ABI digest |
| `kernel` | Kernel C; defines `dolly_NAME_kernel`, the process operations it handles and its release hook ([`process-kernel.h`](../src/process-kernel.h)) |
| `client` | Process C linked as `libdolly-NAME.a`; it records `DOLLY_HOST_REQUIRE(NAME, VERSION, DOLLY_NAME_ABI_DIGEST)` |

A provider's `browser()` and `worker()` receive the page's shared resources
(`mount`, `canvas`, `keyboard`, `applicationBase`, `showStatus`, `fatal`,
`bootstrapSources`, and `inherited`: the custom image record a result tab was
opened with), `send` to the other side, `get(dependency)` and its
`configuration`. They return an instance whose optional members the registry
calls: `start` (Worker/page handshake), `messages`, `bindings` (kernel
imports), `service` (periodic work), `imageRestored(context)` (after the system
image is restored, before image-phase starts), `claimsKey(event)` (take a key
from the display), `surfaceSize`, `entryStarted(context)` (the image ENTRY may
now run) and `dispose`; and whose optional records the registry assembles:
`page` (members of `window.__dolly`, by descriptor), `builder` (the module's
configuration for a child build host, `host.builder`) and `inherited` (what an
opened result tab or restored session inherits, `host.inherited`). A module may
also export `boot(route)`: at most one selects what a route boots, returning the
image, a bootstrap label, the custom image record it restores and its own
configuration, as the snapshot module does for `/session/`.

A module's operations and packets are its own: op numbers are globals in its WAT
contract, packets are in its header. `DOLLY_NAME_ABI_DIGEST` is the SHA-256 of
the exact bytes of its WAT contracts and other headers, so any edit to them
changes the identity its client stamps. The loader refuses an executable whose
digest differs from the provider's, as it refuses a wrong `dolly.process` stamp
([`requirements.mjs`](requirements.mjs)).

Adding a module takes its directory, one name in `manifests.mjs`, its imports
in `abi/dolly-browser-0.wat` and its row in
[browser boundary](../docs/browser-boundary.md); the last two are where a human
reviews the authority it adds. A module without imports may instead own a
reserved origin of the HTTP broker ([`http/local-services.mjs`](http/local-services.mjs)),
as `build` and `packages` do: its service admits each request itself.

## Modules served in the process Worker

`dso@0` (the loader behind `dlopen` and the FFI dispatcher) needs one
process's instance and function table, not the kernel, so its operations are
answered in that process's own Worker. Its Worker side fetches the bundle
once at boot and registers it with the runtime (`serveInProcess`); the
supervisor names it in the start message of exactly the executables that
record the module, and their Worker imports it before `_start`
([`process-worker.mjs`](../src/process-worker.mjs)). Every other Worker loads
none of it, in an image that declares the module too, so declaring it costs a
program that does not record it nothing. An executable records `dso@0` when it
links a member of `libdolly-dso.a`: `cc -rdynamic` selects the loader's client,
a call to `dolly_ffi_*` the FFI client. A program that only calls `dlopen`
gets the process libc's refusal and records nothing.

## Runtimes

A runtime is a module whose manifest says `"provides": "kernel"`; `runtime@0`
is the one this checkout ships, and nothing else about it is special. Every
image declares exactly one with the line of any module (`REQUIRES HOST
runtime@0`). The lint, the page and a build host find it through that field,
never through its name, and a module that others merely depend on is not
thereby declared. A runtime provides:

- the process ABI (`process`: [`dolly-process-0.wat`](../abi/dolly-process-0.wat),
  the gate contract, `process.h`) that its executables compile against;
- the supervisor and image contracts (`contracts`:
  [`dolly-supervisor-0.wat`](../abi/dolly-supervisor-0.wat),
  [`dolly-image-0.wat`](../abi/dolly-image-0.wat)): spawn, wait, signals, the
  terminal mailbox, and the snapshot format of every image and package built
  on it;
- the kernel (`kernel`: its sources link as the kernel itself, not as a
  `dolly_NAME_kernel` module) and its outer `imports`, bound by the kernel's
  own glue rather than by `bindings`;
- a Worker instance with `memory` and `supervisor(dolly)`, which the registry
  hands out as `host.kernel`;
- the seed (`dist/dolly.data`: the compiler, libc adapter and bootstrap
  commands built for its process ABI), which a build boots when a recipe has
  no `FROM`.

Images and packages record their runtime as they record any module: the line
goes into the artifact and its receipt. The page refuses an image whose
runtime it does not provide before ENTRY, naming it; a build refuses a recipe
without one, naming the line to add; `INSTALL` and `amy` refuse a package
whose runtime the installing image does not declare.

Executables carry no `dolly.host` record for their runtime. What an executable
speaks to a runtime is the process contract, and its `dolly.process` stamp is
the identity of exactly that: the typed interface and the bytes of
`process.h`, checked on every executable before instantiation, with or without
a libc ([machine contracts](../abi/README.md)). An executable built for a
runtime with another process contract is refused by that check; runtimes that
implement the same contract run the same executables.

[`runtime-worker.mjs`](../src/runtime-worker.mjs) and the process loader still
load this runtime's kernel, seed and process contract by fixed path; a second
runtime needs its provider to name them.
