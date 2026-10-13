# Investigate: the libraries inside the 0 A.D. builds, and SpiderMonkey, as packages

- STATUS: OPEN
- PRIORITY: 254
- TAGS: packages,catalog,0ad

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

The owner's example of what he meant by packages (2026-10-13): "One example
would be breaking out spidermonkey (just an example) into a package."

## What the inventory says (2026-10-13, unchecked)

- `zero-ad-deps` compiles pkgconf, libpng, FreeType, Ogg, Vorbis, libxml2,
  ICU 68.2, libsodium, Boost's headers, fmt 7.1.3 and ENet, and writes the
  `.pc` files of `zlib`, `curl` and `sdl2`. ENet's sockets are replaced by
  `enet-dolly.c` (0 A.D.'s relay); ICU needs the data file 0 A.D.'s content
  supplies; fmt exists in three versions across the tree.
- FreeType and libpng are taken out of it by `COPY` in `xonotic-build`,
  `wine-build` and `xonotic`.
- SpiderMonkey 128.13.0 is built in `zero-ad-spidermonkey` with mozbuild,
  Python, Cargo and cbindgen; `zero-ad-engine` copies two rows. Its source
  is taken out of 0 A.D.'s release and has no pin of its own; any build
  needs three of 0 A.D.'s six patches; Dolly's 490-line patch is all the
  port's; nothing else would install it today. The inventory writes a
  recipe out and lists five things in the way.
- [A package cannot say what it needs only to build](../20261013-144754-build-needs/TASK.md).
