# Investigate: the engines and compilers built in demo images (Neovim's libraries, llama.cpp, transcribe.cpp, Mojo, Codex, LLVM, Rust and Cargo) as packages

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: packages,catalog,toolchain,owner

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

## Closed (2026-10-14)

Owner (2026-10-14), on the tasks that waited for him: "I'm not gonna go
through 35 tasks, I'm sure some are not relevant anymore and some are
confirmed actual good fixes. If your investigation confirms they are fixes
that improve things and aligh with the main goal of the project go ahead. If
you're uncertain, give me a short description".

Nothing changes. The three LLVMs are three revisions with a recorded reason
each and stay three builds; ggml is two revisions with two flag sets chosen
on purpose; `rust-build` replaces the seed compiler twice by the owner's
choice; Neovim's five libraries are at Neovim's pins with no second user.
A library package of llama.cpp is kept as a candidate in
[builds become generic](../20261013-142800-generic-builds/TASK.md).

## State (2026-10-14, 03:00): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read `main`
`f7ea8f76`, the staged sources, the built images and the logs, and changed
nothing (one report in two parts; the other is
[what is compiled more than once](../20261013-145359-builds-twice/investigation.md)).
The integrator checked the three LLVM pins and the versions they print, one
build time, and the quoted decision in the Mojo task. It gives no verdict.
What it found:

- Every build of this group is where its first commit put it, and all but
  Mojo's were put there before packages existed (Neovim 2026-09-07,
  Codex 09-09, llama.cpp and Pi 09-14). The packages over them came later
  as `COPY` rows or views.
- The three LLVMs are three revisions, not one source built three ways:
  the seed's (`4bfd08c2`, prints 24.0.0git), Mojo's (`4154b56c`, also
  24.0.0git, 2,381 commits later) and Rust's fork (`52ed14fc`, 22.1.8). Each
  has a recorded reason of its own: `llvm-cc` must give the seed
  compiler's bytes; Mojo "is written against its pin … Not tried:
  compiling Mojo against the seed's revision"; rustc accepts any LLVM from
  21 and nothing records a try with another. The three restate one
  configuration and share two patches as three staged copies; `make` took
  2,502, 1,657 and 3,925 s.
- "llama.cpp in two images" is one build and one link. ggml is in both
  engines' trees at different revisions (0.23.0 in llama.cpp, 0.25.3 in
  transcribe.cpp; 194 files differ) and is built with different flags on
  purpose: with threads and SIMD for speech ("what let the model keep up
  with speech"), without either for llama. llama.cpp can take a system
  ggml; transcribe.cpp cannot without a change.
- `rust-build` "replaces the seed compiler in place twice": the rustc it
  built is copied over the seed's and builds the standard library and
  rustc again; the second generation is kept and its standard library must
  compare equal. The owner chose this ("implement choice 1 for v0.1.1").
- Neovim's Lua 5.1 is upstream's requirement, and all five of its libraries
  are at Neovim's own pins. Only utf8proc has a second user, at another
  version (NetSurf's bundled copy).
- Written out, a llama.cpp library package meets the host-module rule both
  ways: its archives stamp nothing, so it seals with `runtime@0` alone; but
  the document says a library declares what every program built with it
  needs, and with `gpu@0` on it the speech images could not install it.
  Both readings are in the catalog today (`sdl2` and `mojo`).
- An LLVM package would not build LLVM fewer times: three revisions stay
  three builds. What three recipes repeat is the base (`cmake-build` with
  Python), the configuration text and the patches.
- Not found out, each needs a build: whether either engine compiles against
  the other's ggml; whether rustc or Mojo compile against the seed's LLVM;
  whether a package keeps a result its recipe later deletes.

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
