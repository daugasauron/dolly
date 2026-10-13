# Investigate: what is compiled more than once (sbase, libjpeg, Zstandard, Lua, Box3D, fmt, termcap, LLVM)

- STATUS: OPEN
- PRIORITY: 248
- TAGS: packages,catalog

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

- The same source at the same pin, compiled in more than one recipe: sbase
  three times from one archive with three lists of tools (`system-tools`,
  `sbase`, `tar`); IJG libjpeg 9f in `xonotic-build` and `wine-build`;
  Zstandard 1.5.7 in `mojo-llvm` beside the package `zstd`.
- Different on purpose, by its reading: Lua 5.1.5 for Neovim, 5.5.1 in
  Slopyard and premake's bundled one; Box3D with and without threads and
  SIMD; fmt 7.1.3 for 0 A.D., 11.2.0 as one file in Mojo, 11.1.1 inside
  OpenAL; termcap in `less`, Emacs's own, and `libterminfo`; three LLVMs.
- The same `SOURCE` named in several recipes: `stb_truetype.h` (4),
  `sbase.tar` (3), `llvm-project.tar.gz` (3), `llvm-host-triple.patch` (4).
