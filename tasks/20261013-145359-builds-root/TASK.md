# Investigate: the base images (system-build, system-tools, system, cmake-build) and the packages that are views of them

- STATUS: CLOSED
- PRIORITY: 256
- TAGS: packages,catalog,core,owner

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

## State (2026-10-14, 02:35): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read `main`
`96832f4d` and changed nothing. The integrator checked the direct `FROM`
counts of the five bases (10, 23, 21, 11, 22), `default`'s eight `INSTALL`
rows, the commit that placed sbase and its message, and two quoted tasks. It
gives no verdict. What it found:

- The owner's goal for this chain, said on 2026-10-13 and recorded here
  because no task held it: "The long term goal is that the core things
  (that triggers rebuilds of everything), like the slop shell, runtime,
  modules etc, become stable and reusable. Recently we're rebuilding from
  the core all the time because the core has issues. This is expected but
  the long term goal is to get away from that."
- sbase, Git, awk and Samurai are in `system-tools` by one decision
  (`6d533a7e`, 2026-09-30): "sbase builds the remaining utilities in
  system-tools, so system-build stays the compiler and basic build
  commands." It took back a commit of the same day that had put sbase in
  the root in place of Dolly's own `ls`, `cp`, `test` and the rest, whose
  "semantics were deliberate". `system-build` itself was born on 2026-09-09
  to break a cycle with the Rust tools.
- The order the bootstrap forces is short: seed, engine, the four compiler
  proxies, Slop, 18 commands, `tar`, Make, libc++. Everything
  `system-tools` builds needs only those plus `zlib` and `curl` for Git; so
  there is no chicken and egg for sbase today. Make is built by `cc` rows
  and needs no Make; inside the root its one user is libc++, since
  2026-10-08.
- Counted over 130 recipes, how many images a change repins: a root
  command's source (`cat.c`, `test.c`, Slop, Make) 127; anything of
  `system-tools` (a Git patch, `amy.c`, sbase's pin) 114; `display` 115;
  libuv or CMake 83; `session-recover.c` 52; `nena.c` 2; any seed file all
  130. In the last 14 days four changes of one command each (`ls -l`,
  `touch -t`, `test -x`, `help` at 80 columns) were a repin of the catalog.
- What a narrower root would and would not change, read from the recipes'
  `REQUIRES TOOL` rows. Things no build needs (`amy`, Git, `download`,
  `upload`): as packages that hold their builds and that only `default`
  installs, a change reaches 1 or 2 images in place of 114. Things every
  build needs (`ls`, `cp`, `test`, `tar`, Make, Slop, sbase's `sed` and
  `grep`): any base that holds them carries its closure, so the reach stays
  127 or 114 in any shape. Seed files: 130 in any shape.
- The proposal "each package holds its build `FROM system-build` and
  `system-tools` installs them" has been written three times before the
  inventory (2026-10-05, 2026-10-12 twice) and not built.
- Written out: `git` as its own build is about 160 rows `FROM system-build`
  with `INSTALL zlib` and `INSTALL curl`, and those two rows then arrive
  with `amy install git`. `cmake-build` as a composition meets a cycle
  (`cmake` is `FROM cmake-build`), and as `INSTALL cmake` it would restore
  the compiler's 126 MB over the same files it already has. `make` as a
  package meets a cycle with libc++ in the root.
- The inventory's "no base holds pkg-config" is false (`zero-ad-deps`), and
  "`rust-build` never sees `system-tools`" is true of its `FROM` chain only.
- Not found out: the reasons for the splits of 2026-09-06 to 09-13 (no
  commit says); whether Git, Samurai and awk build on `system-build` alone
  (by reading, yes); any size or time of a split shape; whether an opened
  image's program needs Git at run time.

## What the inventory says (2026-10-13, unchecked)

- `system-build` holds the seed's compiler, Slop, 19 commands, `dollyfile`,
  libc++ and Make; `core`, `cc` and `make` are views of it. It calls this
  the bootstrap root, which needs Make before a package can exist.
- `system-tools` compiles sbase, Samurai, Git, awk and 16 Dolly commands
  and installs `zlib`, `gzip`, `curl` and `display`; `posix`, `ninja`,
  `git`, `amy` and `transfer` are views of it. One Makefile there builds 16
  commands for three packages. 104 of 133 images are built on it.
- `cmake-build` compiles libuv and CMake; 11 recipes are `FROM` it.
- It proposes one shape: a base installs and compiles nothing, a package
  holds its build; and notes that `rust-build` never sees `system-tools`
  and that no base holds pkg-config.
- The reflection on the direction makes the same proposal
  ([section 5](../20261013-142800-direction/reflection.md)).

## Closed 2026-10-15

amy, Git, `download` and `upload` hold their builds as packages (`5caa5e81`, signed off 2026-10-14); `system` installs `transfer`. Verified in the round of 2026-10-14/15 on `integrate/round-1014b` (evidence `work/rust/build/round-1014b-evidence/`: source 431/0, artifacts 25/0, the core browser suite and every demo test in their browsers, five GPU tests), fast-forwarded into local `main` (`00caf5ec`). `zero-ad-engine`, which descends from `system-tools`, installs `transfer` for its tests (`6ff53e8b`).
