# More languages in Dolly: Go and others

- STATUS: CLOSED
- PRIORITY: 120
- TAGS: toolchain,packages

Owner (2026-10-23): "Are there any other languages that can be added? go?"

Today: C and C++ (`cc`, LLVM built in Dolly), Rust (rustc and Cargo built in Dolly), Zig (with
LLVM), Python (CPython), JavaScript and TypeScript (QuickJS, Janis, tsc), Lua, Mojo.

Done when: `investigation.md` here says, for Go and the other candidates, what it takes to
build each inside Dolly from upstream source for wasm64, measured where it can be, with a
ranked recommendation; the owner picks.

## Result (2026-10-23)

`investigation.md` (a Fable agent, read-only; each claim marked read, measured, web or
inferred). In short:

- Go: only a `GOOS=dolly GOARCH=wasm64` port of gc itself, with a host-built stage 0 as Rust
  has. Go's wasm backend narrows every address to 32 bits and upstream is adding `wasm32`, not
  memory64, so it is a fork carried across two Go releases a year: 6-10 engineer-weeks, after
  a 1-2 week memory64 spike on the host. TinyGo, gollvm and gccgo are no paths.
- OCaml 5.5: bytecode only (no `ocamlopt` backend for Wasm exists). Upstream's `boot/ocamlc`
  and `make bootstrap` fixpoint need nothing host-built; two small runtime patches (the
  minor-heap reservation's `MAP_FIXED`, `sigaltstack`). 2-4 days; dune +1-2.
- Perl ranks first by value per day (3-7 days): three host-side generation steps and `ne`
  wait on it.

Decision: OCaml now (task 20261023-210000-ocaml), Perl after it, Go not now.
