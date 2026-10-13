# Investigate: packages that are views of a build image (pkgconf, libpng, freetype, openal, libuv, lua, raylib, box3d and the rest)

- STATUS: OPEN
- PRIORITY: 252
- TAGS: packages,catalog,dollyfile

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

- 31 of 79 packages hold no build: 22 are `FROM` a build image and compile
  nothing, 9 are `COPY` rows.
- For eight of them it finds "nothing entangled" or little: `pkgconf`,
  `libpng`, `freetype` (`zero-ad-deps`), `openal` (`openal-build`), `libuv`
  (`cmake-build`, a port with a 151-line patch), `lua` (`COPY` from
  `neovim-build`), `raylib` and `box3d` (`gamedev-sdk`, one `sdk.mk`).
- For others it names what is in the way: `nvim` needs five static
  libraries in its base, `display` needs Zig, `rust` and `cargo` come out of
  one recipe that replaces the seed compiler in place twice, `codex` and
  `pi` need protox and `tsc` in their base.
- `docs/dollyfile.md` ("Packages and amy") and the rule written on
  2026-10-12 ("cheapest shape first: a thin `PACKAGE`") recommend views.
