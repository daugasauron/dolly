# Builds become generic: what a build image makes for itself is a package with its own build

- STATUS: OPEN
- PRIORITY: 330
- TAGS: packages,catalog,owner

Owner (2026-10-13): "Last night when I said "break out more things as
packages" I mean that to simplify and make the current builds more generic.
One example would be breaking out spidermonkey (just an example) into a
package. It seems you just started adding random stuff? It's fine, keep
them, but that was not the point. I want to simplify and create as many
reusable, good, no shortcuts, packages as possible."

Done when: every library, engine and tool that a build image compiles for
itself and that something else could use is a package holding its own build
from its pinned source; the images that needed it install it; no package is
only a view of a demo's build image; each has its check in
`test/amy-browser.mjs` or its consumer's test; the list of what was not
broken out says why for each.

## State (2026-10-14, 00:00)

[The inventory](inventory.md) is made, by an agent that read all 133 recipes
and changed nothing. The owner read it: "I agree in some sense, but some of
the judgement is again too blunt. These are all good points but needs way
more understanding to make a call if the changes actually improve things or
not."

So the inventory is a map of where builds live and a list of candidates, not
a plan: it proposed a package set and nine steps from the recipes' text,
without reading why each build is where it is or showing on a real case that
breaking it out improves anything. No step of it is taken. Each group of its
points is a task that investigates and decides nothing:

- [packages that are views of a build image](../20261013-145359-builds-views/TASK.md);
- [the libraries inside the 0 A.D. builds, and SpiderMonkey](../20261013-145359-builds-zero-ad-deps/TASK.md),
  the owner's example;
- [the engines and compilers built in demo images](../20261013-145359-builds-engines/TASK.md);
- [the base images and their views](../20261013-145359-builds-root/TASK.md);
- [what is compiled more than once](../20261013-145359-builds-twice/TASK.md);
- [a package cannot say what it needs only to build](../20261013-144754-build-needs/TASK.md),
  a question about the language it met on the way.

Running, by the owner's word of the same evening:
[the javascript package split](../20261013-135951-javascript-split/TASK.md).

## As filed (2026-10-13, main `50c698f8`)

- What was done instead on 2026-10-12 and 2026-10-13: thirty new packages,
  most of them programs the catalog did not have (`sqlite`, `jq`, the
  archivers, …). They stay. Fifteen of the earlier ones (`ninja`, `make`,
  `libuv`, `lua`, `raylib`, `box3d`, `libpng`, `freetype`, `pkgconf`, …) are
  thin recipes over the image that happens to build the thing: the build
  still lives in a demo's image, which is the shortcut the owner does not
  want.
- The aim, in his example: SpiderMonkey is compiled inside
  `demos/zero-ad/Dollyfile-zero-ad-spidermonkey` for 0 A.D. alone. As a
  package with its own build, 0 A.D.'s engine installs it and anything else
  can.
- Since 2026-10-13 a package's `INSTALL` rows are installed by reference, so
  a build that installs ten packages holds none of them, and a package that
  installs another adds nothing to its own snapshot.
- Rebuilding much of the catalog for this is accepted: complete rebuilds are
  the owner's intent ("robust and reliable"), not a cost to avoid.

To do first, before any recipe moves: the inventory. For every build image,
what it compiles that is not its own demo's program (the engines: SpiderMonkey,
QuickJS, the three LLVMs, CPython, llama.cpp, transcribe.cpp; the libraries:
ICU, libsodium, ENet, Boost's headers, Ogg, Vorbis, fmt, libxml2, OpenAL,
SDL2, zlib, tree-sitter, utf8proc, LPeg, luv, libevent, the terminfo
library, Ghostty's terminal library; the tools: gmqcc, pkgconf, CMake,
Ninja, Make), who uses it today, whether two images build the same thing
twice, and the order in which to break them out so that each step leaves
every image building.
