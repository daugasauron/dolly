# Lean

Lean 4.35 from upstream's release, bootstrapped inside Dolly from the C in
its `stage0/`, as the `lean` package: `amy install lean`, then `lean` to
check a file or run one with `--run`, and `lake` to make and build a
package, whose programs `cc` compiles from the C Lean emits.

## Images

- `lean`: Lean 4.35: `lean`, `lake` and `leanc` with Lean's libraries; Lake builds programs with the `cc` package.
- `lean-std`: Lean's `Init` and `Std` libraries, which the `lean` package installs.
- `lean-meta`: Lean's `Lean` library, the compiler and elaborator that `import Lean` reads and every Lean program links, which the `lean` package installs.
- `lean-stage0`: the first lean of the bootstrap, built from upstream's stage0 C.

## Building

Upstream's build is CMake around Bash: `stdlib.make`, `lean.mk`, `leanc.sh`
and `leanmake` are Bash scripts, the libraries are linked into shared
libraries, and stage 1 downloads mimalloc, CaDiCaL and leantar. Dolly has
no Bash and links every program statically, so
[`lean-dolly.mk`](lean-dolly.mk) does what CMake and those files do:

1. Stage 0: the C++ runtime, kernel and library, and the 2,371 C files the
   release before emitted (`stage0/stdlib`), make the first `lean`.
2. Stage 1: that `lean` compiles the release's 2,550 Lean modules (`Init`,
   `Std`, `Lean`, `LeanExport`, `Lake`, `Leanc`), each to its `.olean`
   files and its C, which `cc` compiles at once, as upstream does without
   Lake (`USE_LAKE=OFF`); the C++ is compiled again from `src/`, and the
   release's `lean`, `lake` and `leanc` are linked.

The flags are those CMake computes for a Unix that is neither Linux nor
Darwin, in a Release build without GMP, mimalloc or mmap: Lean's own bignums,
Dolly's allocator, and `.olean` files read, since Dolly's `mmap` copies the
file anyway. Task threads get 8 MiB of stack, as under Emscripten, instead of
1 GiB, since a thread's stack is in the process's own memory.
`-fstack-clash-protection` is not given: Dolly's compiler has no stack
probes and refuses it.

Lean's interpreter calls compiled code by its symbol, which it finds with
`dlsym` in the symbols `-rdynamic` exports. A threaded Dolly program has no
`-rdynamic`, so `lean` and `lake` are linked with a table of the same
symbols, generated from the archives' WebAssembly objects by
[`lean-symbols.c`](lean-symbols.c), each function declared with the
signature its object gives it. A program Lake links has no table, as
natively it has no exported symbols either.

`lean` and `lake` recurse deeper than a Chrome Worker's stack holds (stage
0 fails on `Init/Prelude.lean` without it), so they ask to be entered on the
larger stack a browser may have, as the compiler does
([`lean-stack.c`](lean-stack.c), [browser stack](../../docs/browser-stack.md)).

[`lean-dolly.patch`](lean-dolly.patch) is applied to `src/` and to its copy
in `stage0/src`:

- `IO.Process.spawn` forks; Dolly has none, so it spawns with
  `posix_spawnp`, whose actions set the child's descriptors and directory. A
  Dolly process leads its own session already.
- Eight C++ definitions take other parameters than the Lean declarations
  that call them: six IO functions keep a world argument the compiler no
  longer passes, and two `Unit →` functions take none. A native call
  ignores the difference; a WebAssembly call must match, or the linker
  makes it a trap, so the definitions take what Lean declares.
- The interpreter looks symbols up in that table (`lean_dolly_symbol`).
- The libraries closures are relocated against are the program alone: a
  Dolly process is one module, and there is no `dl_iterate_phdr`.
- The program's path is read from `/proc/self/exe`, the only such link
  Dolly's kernel answers.
- The OpenSSL version is 0, as under Emscripten: Dolly has no OpenSSL.
