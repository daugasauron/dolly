# Investigate: what is compiled more than once (sbase, libjpeg, Zstandard, Lua, Box3D, fmt, termcap, LLVM)

- STATUS: CLOSED
- PRIORITY: 248
- TAGS: packages,catalog,owner

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

Nothing changes now. Of the three true repeats none is a clear gain as it
stands: one sbase build of all 53 tools would put sbase's `tar` in every
image on `system-tools`; `mojo-llvm` installing `zstd` would put the page
formatter's pin under Mojo's 65-minute LLVM; `libjpeg` as a package means
choosing one of two flag sets for Xonotic and NetSurf. `libjpeg` is kept as
a candidate in [builds become generic](../20261013-142800-generic-builds/TASK.md).

## State (2026-10-14, 03:00): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read `main`
`f7ea8f76`, the staged sources and the logs, and changed nothing (one report
in two parts; the other is
[the engines](../20261013-145359-builds-engines/investigation.md)). The
integrator checked sbase's archive in three recipes, the `zstd` package's
defines and the JPEG rows of the two Makefiles. It gives no verdict. What it
found:

- Three repeats are the same source at the same pin, and none was ever
  compiled to the same bytes:
  - sbase: three recipes, the same flags, three disjoint lists of tools
    (44, 8 and 1); its two small libraries are compiled three times. The
    two packages sit on `tools-build` for their manual pages.
  - IJG libjpeg 9f: 46 units at `-O1` for Xonotic, 26 decoder units at `-O2`
    with threads for NetSurf in the Wine image. Neither exports a library.
  - Zstandard 1.5.7: three directories with no defines inside `mojo-llvm`,
    the whole library with upstream's defines in the package `zstd`, which
    came eight hours later the same day and already exports `libzstd.a`
    and its headers.
- The second copy was each time made when no package existed to install.
- "Different on purpose" holds on the record for most: Lua 5.1 is Neovim's
  requirement; Box3D's second build was measured (6.8% less simulation
  time) and later fixed a 71-minute hang; fmt's three versions are three
  upstreams' choices, one of them Dolly's own for 0 A.D.; `less` has GNU
  termcap because nothing else asked for one, and tmux needed a function it
  lacks. Not on the record: why Slopyard took Lua 5.5.1.
- Written out: `libjpeg` as a package is about twenty rows, and then one of
  today's two flag sets is chosen for both users. `mojo-llvm` installing
  `zstd` needs nothing added to the package; it would bring the tool into
  the Mojo build images and put the page formatter's pin under Mojo's
  65-minute LLVM. One sbase build of all 53 tools would put sbase's `tar`
  in `/bin` of every image on `system-tools`, which the `tar` package
  today confines to whoever installs it.
- The repeated `SOURCE` rows are as the inventory counted;
  `llvm-host-triple.patch` is one file served at three paths.
- Not found out, each needs a build: whether `less` works on
  `libterminfo`; whether 0 A.D. or OpenAL compile against fmt 11; how
  Mojo's link resolves its two copies of xxHash.

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
