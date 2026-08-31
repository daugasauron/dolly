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

