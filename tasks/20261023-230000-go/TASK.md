# Go built inside Dolly, bootstrapped as Rust is

- STATUS: OPEN
- PRIORITY: 200
- TAGS: toolchain,go,bootstrap,0.1.4

Owner (2026-10-23): "one that tries to bootstrap go properly (similar to rus)". Route and
reasons: [the languages investigation](../20261023-200001-languages/investigation.md),
section 2, route A: Go's own toolchain (gc) with a new `GOOS=dolly GOARCH=wasm64`. Go's wasm
backend narrows every address to 32 bits and its linker defines its own memory; Dolly is
memory64 with an imported shared memory and its own executable sections (`src/compiler.cpp`
says what `cc` stamps). Upstream adds wasm32, not memory64, so this is a fork of Go's tree
carried as patches, like `demos/rust`'s.

Bootstrap, as `demos/rust`: stage 0 is the patched tree cross-built on the host
(`GOOS=dolly GOARCH=wasm64`), recorded as the bootstrap exception; stage 1 is the toolchain
rebuilt inside Dolly from that seed, and compared with it.

First step: memory64 in the backend and linker alone, proven on the host before any Dolly
code. TinyGo, gollvm and gccgo are not paths (investigation, routes B to D).

Done when: in a Dolly session `go build` makes a program that runs as a command; the
toolchain rebuilt inside Dolly equals its seed (or the difference is understood and
recorded); `gofmt` and one pure-Go tool agents use run; a browser test proves it in
Chromium and Firefox; `demos/go/README.md` names the bootstrap exception and the patches.
Each step's measurements are recorded here as they are made.
