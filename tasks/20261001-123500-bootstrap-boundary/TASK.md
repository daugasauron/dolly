# Move Slop and other bootstrap programs out of the seed into recipes

- STATUS: OPEN
- PRIORITY: 290
- TAGS: core,bootstrap,dollyfile,design

Owner request (2026-10-01): investigate why the bootstrap boundary is where
it is. Slop could be compiled by a Dollyfile instead of being a "kernel thing"
included by default; the core should be as small as possible, with everything
else modular.

## Today (read 2026-10-01)

- The seed (`dist/dolly.data`, `scripts/build.sh`, `scripts/prepare-kernel-seed.sh`)
  holds the stamped compiler executable, process libc and headers, and the
  sources of the `cc`/`c++`/`ld`/`ar` wrappers, Slop and the Dollyfile engine.
- `src/process/bootstrap.c` runs inside Dolly before any recipe: it compiles
  those wrappers, Slop and the engine with the seed compiler (`-O1`) into
  `/bin`, then runs the root recipe.
- Slop must exist first because the only command step is `SLOP`, which runs
  `/bin/slop -e -c` (`docs/dollyfile.md`).

## Questions

- What is the smallest seed: kernel, compiler executable, libc/sysroot and
  the Dollyfile engine (plus bootstrap)? Can the engine itself be built by an
  earlier, smaller engine, or must it stay a bootstrap exception?
- A shell-free exec step (for example `RUN program argument…`, argv only)
  would let `modules/slop.dm` build Slop like any program; the same for the
  compiler wrappers and core commands. What does it cost in the language and
  the engine, and what else depends on `/bin/slop` existing at boot (the
  bootstrap's own messages, `ENTRY`, session recovery, tests)?
- Identity: moving Slop into a recipe makes it part of `system-build`'s
  recipe graph instead of the seed hash.

## Done when

- A decision memo with measurements, then: Slop (and whatever else need not
  be in the seed) is built by recipes; the seed lists only what must bootstrap.

## Owner proposal (2026-10-01)

A `COMPILEC` step that runs the seed compiler directly, as `bootstrap.c`'s
`compile_source()` does today, so `modules/slop.dm` can compile Slop before
any `SLOP` step. Leading design, prototyped against a general argv-only `RUN`.
