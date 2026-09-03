# JavaScript runtime choice

## Decision

Keep QuickJS-ng for the current experiment. It is not Node, but it is the best
fit for discovering Dolly's platform substrate: a current, small C engine that
builds as an ordinary wasm64 filesystem executable and has a direct embedding
API. Dolly supplies the measured Node-shaped surface Pi actually uses through
Janis rather than importing an operating system or browser API wholesale.

The important split is:

```text
QuickJS-ng                 Janis                         Dolly
ECMAScript engine   +   measured node:* APIs   +   files/lifecycle/HTTP
```

Engine replacement would not remove the Janis work. Node compatibility is
mostly runtime APIs, module resolution, streams, terminal behavior, and
lifecycle semantics—not ECMAScript evaluation.

This split is now the production Pi path rather than a parallel experiment.
The unchanged TypeScript 5.9.3 CommonJS compiler runs through Janis as
`/usr/bin/tsc`, reads and writes WasmFS, and emits all 495 modules in the seven
pinned Pi runtime workspace packages. `/usr/bin/pi` loads those unbundled ESM
files plus a reviewed 31-package external profile directly from WasmFS. The
same command passes deterministic streaming/tool tests and a real OpenRouter
extension-install turn. Host esbuild is no longer a build dependency.
Pi's ordinary runtime resources live beside that emitted `dist` tree in its
installed package root; the image build initializes and stops the real TUI as a
regression gate rather than checking only CLI metadata.
The browser suite also writes a TypeScript Pi extension into WasmFS, compiles it
with the target `tsc`, restarts Pi, and invokes the emitted tool. This closes the
first extension source loop without a host compiler or runtime package fetch.

Pi's Dolly settings set `images.autoResize` to false. Standard PNG, JPEG, GIF,
and WebP inputs therefore pass through unchanged instead of entering Pi's
Photon resize path. Photon is a wasm32 module instantiated through JavaScript's
`WebAssembly.Module`; QuickJS-ng does not provide a nested WebAssembly engine,
and a real Janis probe reaches exactly `ReferenceError: WebAssembly is not
defined`. Shipping that package would add 2.27 MB of dead input while causing
Pi to omit images whenever auto-resize was requested, so the explicit runtime
profile excludes it. This is a runtime compatibility boundary, not a reason to
add a browser import.

Janis reached that point through measured additions: mode-aware import/require
conditions, ESM and CommonJS package scopes, JSON modules,
`import.meta.resolve`, relative `.cjs`, package imports/exports, and
deterministic `fs.globSync`. These are runtime compatibility rules over the
shared filesystem, not browser capabilities.

The resolver is intentionally not an npm client. It normalizes and confines
export targets to their package root, searches only WasmFS, and fails when a
package, export, file, or builtin adapter is absent. No resolution path calls
HTTP, the DOM, or a host module loader.

## Alternatives considered

| Engine/runtime | Attractive part | Why it is not the next move |
| --- | --- | --- |
| [QuickJS-ng](https://github.com/quickjs-ng/quickjs) | Maintained, portable C, embeddable, current ECMAScript target, simple interrupt hook | Current choice; improve conformance only where Pi or another real workload proves a gap |
| [Boa](https://boajs.dev/docs/intro) | Active, memory-safe Rust engine; upstream demonstrates a Wasm build | Adds a Rust toolchain and a much larger dependency graph while still requiring the same Node compatibility layer |
| [MuJS](https://mujs.com/) | Very small portable C and simple embedding API | A scripting engine, not a credible target for modern TypeScript-generated agent packages |
| [Ladybird LibJS](https://github.com/LadybirdBrowser/ladybird) | Modern independent C++ engine with active standards work | Coupled to a large browser-library graph; no evidence yet that it is a clean wasm64 Dolly port |
| [V8](https://v8.dev/docs/embed), Node, or Deno | Highest npm compatibility and production engine behavior | Their native build/runtime assumptions and size make them poor substrate probes; no supported build emits the shared-everything wasm64 Dolly executable required here |

Nested wasm32 runtimes such as WAMR are also the wrong boundary. They would
create another memory/filesystem/process model instead of letting JavaScript
share Dolly's wasm64 filesystem and lifecycle directly.

## Revisit gate

Run a replacement experiment only when a concrete Pi incompatibility is inside
the ECMAScript engine rather than Janis. A candidate must compile to Dolly's
wasm64 command format, use the same WasmFS and HTTP edge, support interruption,
survive repeated invocation, and run the existing Pi test corpus. Until one
passes that gate with materially less compatibility code, switching engines is
cost without evidence.
