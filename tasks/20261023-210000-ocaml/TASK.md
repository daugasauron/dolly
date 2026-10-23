# OCaml in Dolly, built from upstream inside Dolly

- STATUS: OPEN
- PRIORITY: 110
- TAGS: toolchain,packages,0.1.4

Owner (2026-10-23): "OCaml would also be cool." Route and costs:
`tasks/20261023-200001-languages/investigation.md`, section 3.

OCaml 5.5 bytecode: `ocamlrun` built by `cc` from `runtime/`, then `ocamlc`, the stdlib, the
toplevel, `ocamllex`, `ocamlyacc`, `unix` and `str` built inside Dolly from upstream's
`boot/ocamlc`, with upstream's own fixpoint (`make bootstrap`) as the recipe's check. configure
runs at preparation in the pinned container, as CPython's does, recorded as the bootstrap
exception. No native compiler exists for Wasm: say so in the README.

Done when: an `ocaml` package installs from `amy`; in a browser session `ocaml` evaluates an
expression, `ocamlc` compiles a program with `unix` that runs as a command, and the fixpoint
holds; a browser test proves it in Chromium and Firefox.
