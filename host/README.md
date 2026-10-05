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
| `dependencies` | Modules this one uses through `get(name)` |
| `phase` | When the Worker side starts: after the kernel loads (`kernel`) or after the image is restored (`image`) |
| `imports` | Kernel Wasm imports this module provides; `abi/dolly-browser-0.wat` is their reviewed allowlist |
| `host` | Trusted JavaScript: `check()`, `browser()` and `worker()` sides ([`modules.mjs`](modules.mjs)); a module with a client exports the `digest` it implements |
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

`runtime` uses the same format; its files are the core in `src/`, `abi/` and
`include/dolly/`, and its identity is the `dolly.process` stamp. Adding a module
takes its directory, one name in `manifests.mjs`, its imports in
`abi/dolly-browser-0.wat` and its row in
[browser boundary](../docs/browser-boundary.md); the last two are where a human
reviews the authority it adds. A module without imports may instead own a
reserved origin of the HTTP broker ([`http/local-services.mjs`](http/local-services.mjs)),
as `build` and `packages` do: its service admits each request itself.
