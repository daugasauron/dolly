# OCaml

OCaml 5.5 from upstream's release, built inside Dolly from upstream's own
bootstrap compiler, as the `ocaml` package: `amy install ocaml`, then
`ocaml` for the toplevel or `ocamlc` to compile a program, which runs as a
command.

## Images

- `ocaml`: OCaml 5.5: the bytecode compiler `ocamlc`, the toplevel `ocaml`, `ocamllex`, `ocamlyacc`, `ocamldep`, and the standard, `unix`, `str` and threads libraries.

## Bytecode only

OCaml has no native code generator for WebAssembly, and `ocamlopt` for
wasm64 does not exist. `wasm_of_ocaml` translates bytecode to WasmGC for a
JavaScript engine, which a Dolly process is not. Here everything is
bytecode run by `ocamlrun`: a program `ocamlc` links starts with
`#!/usr/bin/ocamlrun`.

## Building

[`prepare-ocaml.sh`](prepare-ocaml.sh) configures the release outside Dolly,
in the pinned Emscripten container (a bootstrap exception), as zsh's is:
`--disable-native-compiler` and no shared libraries. Where Dolly and
Emscripten's libc differ, the script states the result. Dolly compiles the
runtime, and the release's `boot/ocamlc` builds the standard library, the
compiler and the tools ([`Dollyfile-ocaml`](Dollyfile-ocaml)). Then
upstream's `make bootstrap` rebuilds the compiler with itself twice and
fails unless the last two are the same bytes: the recipe's check. Nothing
of the compiler is built on the host.

[`ocaml-dolly.patch`](ocaml-dolly.patch) changes what Dolly does not offer:

- `MAP_FIXED` is refused and an anonymous mapping is committed, so a minor
  heap is committed with `mprotect`, as on Cygwin; and a process may have 16
  domains, not 128, since every domain's minor heap is reserved at start-up
  (128 took 256 MiB a process).
- `sigaltstack` fails with `ENOSYS`: signal handlers run on the thread's own
  stack.
- A program with C stubs (`unix`, `str`, `threads`) is linked with a custom
  runtime, as without shared libraries anywhere, and the bytecode follows
  it. A WebAssembly module ends at its last section, so the bytecode is
  appended as a custom section.
- `Unix.create_process` spawns with `posix_spawn`, whose close action Dolly
  does not take: the child keeps the descriptor it was given, beside its
  copy as standard input or output.
- `Unix.gethostbyaddr` raises `Not_found`: Dolly's libc has no
  `gethostbyaddr`.

The runtime is linked with `-pthread`: `Domain.spawn` and `Thread.create`
run on Dolly's threads (`threads@0`). The toplevel loads no library with C
stubs (`#load "unix.cma"` needs shared libraries); `ocamlmktop` makes a
toplevel with them.
