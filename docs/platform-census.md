# Platform census

Dolly should derive its platform from real programs rather than a POSIX
checklist. The first census is a deterministic link-time view of a sealed image:

```sh
npm run census -- default
npm run census -- gamedev
npm run census -- python
```

Each command verifies the snapshot against its packaged byte length and
SHA-256, decodes the opaque system format, and finds executables by structure:
they are Wasm modules with a `dolly.abi` custom section and the typed
`dolly_main` export. File extensions, paths, and permission bits do not decide
whether something is executable.

The generated `build/platform-census-IMAGE.md` contains both mappings:

- each exact typed import to every executable that requires it;
- each executable to its count of imported operations.

Shared memory/table infrastructure and `GOT.*` relocation mechanics are
excluded. Everything else is retained exactly, including libc-shaped imports,
Dolly-native operations, compiler bridges, and explicit-denial wrappers. An
import is evidence of a link-time requirement; it does not prove the operation
ran, succeeded, or should survive into a future ABI below libc.

Current sealed-image results are:

| Image | ABI-stamped executables | Distinct typed operations |
| --- | ---: | ---: |
| default | 103 | 318 |
| gamedev | 104 | 336 |
| python | 106 | 374 |

For example, the Python image shows that only `python` and `python3` import the
new terminal-mode get/set operations, while Slop, Janis/Pi/QuickJS, and Python
share terminal dimension operations. It also makes the distinction between
browser authority and internal compatibility concrete: many commands import
`dolly_http_perform`, but the main runtime still has only the one intentional
agent-selected browser network edge, `env.dolly_http_dispatch`.

The next census layer is dynamic process-invocation evidence. It should count
operations exercised by browser acceptance workloads without adding an ambient
export channel: retain the report in WasmFS and export it only as an explicit
test artifact. Static and dynamic rows can then be compared with equivalent
Linux fixtures before promoting any libc-shaped operation into an ABI v1
substrate.

For the complementary browser-boundary and full-capsule identities, see
[`capability-fingerprint.md`](capability-fingerprint.md).
