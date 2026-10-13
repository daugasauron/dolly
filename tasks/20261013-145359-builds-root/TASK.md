# Investigate: the base images (system-build, system-tools, system, cmake-build) and the packages that are views of them

- STATUS: OPEN
- PRIORITY: 256
- TAGS: packages,catalog,core

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
