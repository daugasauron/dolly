# Investigate: the engines and compilers built in demo images (Neovim's libraries, llama.cpp, transcribe.cpp, Mojo, Codex, LLVM, Rust and Cargo) as packages

- STATUS: OPEN
- PRIORITY: 250
- TAGS: packages,catalog,toolchain

Owner (2026-10-13), on
[the inventory of builds](../20261013-142800-generic-builds/inventory.md): "I
agree in some sense, but some of the judgement is again too blunt. These are
all good points but needs way more understanding to make a call if the
changes actually improve things or not."

This task investigates one group of its points. It decides nothing.

Done when it holds, with the evidence and without a verdict, for each thing
in the group:

- how its build came to be where it is: the commits and tasks that put it
  there, quoted, and the reason each gives;
- how it is built today (sources and pins, patches and whose they are, what
  the build needs that is not in its base) and who uses the result, read
  from the recipes;
- what a package holding its own build would look like in a real recipe,
  written out far enough to see what it needs: its base, its build tools,
  what it exports, what its users would then say;
- what that would improve and what it would cost or lose, each shown on a
  real case and not asserted: who else could use it, what gets simpler in
  the recipes that use it today, what gets more complicated (a base image
  per set of build tools, a pin that does not exist yet, a patch that is a
  demo's own, versions two users disagree on);
- what could not be found out without building.

The owner decides what, if anything, follows.

## What the inventory says (2026-10-13, unchecked)

- `neovim-build` compiles Lua 5.1.5, LPeg, luv, utf8proc and tree-sitter
  besides Neovim; `lua` and `nvim` are `COPY` rows out of it.
- llama.cpp in `llama-build` and `local-llm-build`, transcribe.cpp in
  `speech-build`, each with its own copy of ggml; `llama`, `speech-to-text`
  and `voice` are views.
- `mojo` is five `COPY` rows from `mojo-build` and `mojo-runtime`; `codex`
  and `pi` are `COPY` rows from their build images; `llvm` one from
  `llvm-cc`.
- `rust` and `cargo` are `COPY` rows from `rust-build`, which replaces the
  seed compiler in place twice and then builds Cargo.
- LLVM is built three times (the `llvm` demo's 24, `rust-llvm` 22.1.8,
  `mojo-llvm` with MLIR and Mojo's patch): three compilers' pins, which the
  inventory calls real differences and leaves as build stages.
