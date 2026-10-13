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

## State (2026-10-14, 03:00): each group is investigated; no step is taken

[The inventory](inventory.md) was made by an agent that read all 133 recipes
and changed nothing. The owner read it: "I agree in some sense, but some of
the judgement is again too blunt. These are all good points but needs way
more understanding to make a call if the changes actually improve things or
not."

So each group of its points became a task that investigates and decides
nothing. In the night of 2026-10-14 each was read by a Fable agent,
read-only: how each build came to be where it is, how it is built today and
who uses it, what a package holding its own build would look like written
out as a recipe, what that would change on real cases, what would rebuild.
The integrator checked each report against the tree before storing it. No
recipe has moved.

What came out, in a few lines each (the tasks hold the evidence):

- [The libraries of the 0 A.D. builds, and SpiderMonkey](../20261013-145359-builds-zero-ad-deps/TASK.md),
  the owner's example. Why SpiderMonkey has an image of its own is written
  down (2026-10-07). As a package it needs a build base that no image is
  today; with its tools as `INSTALL` rows it would carry Python, Rust and
  Cargo into whoever installs it. ICU and ENet are less 0 A.D.'s than the
  ruling of 2026-10-12 says.
- [The base images and their views](../20261013-145359-builds-root/TASK.md).
  sbase, Git and awk are in `system-tools` by one decision of 2026-09-30.
  What every build needs repins the catalog in any shape; what no build
  needs (`amy`, Git, `download`, `upload`) would reach 1 or 2 images in
  place of 114 as packages holding their builds.
- [The packages that are views](../20261013-145359-builds-views/TASK.md).
  30 of 77 hold no build. The document ranks no shape; "cheapest shape
  first" was the packages task's rule. The build steps move whole; what is
  entangled stands around them (a base built on the result, options chosen
  for one user, a second build with other options).
- [The engines and compilers in demo images](../20261013-145359-builds-engines/TASK.md).
  Three LLVMs are three revisions with a reason each; ggml is two revisions
  with two flag sets; a library package of llama.cpp meets the host-module
  rule both ways.
- [What is compiled more than once](../20261013-145359-builds-twice/TASK.md).
  Three true repeats (sbase, libjpeg, Zstandard), none ever compiled to the
  same bytes; `mojo-llvm` could install the `zstd` package as it is.

One question of the language comes back in every one of the five, and is
the owner's: [a package cannot say what it needs only to build](../20261013-144754-build-needs/TASK.md).
A second one comes back in two: what a library package declares of host
modules, what its archive stamps (nothing) or what every program built with
it needs (`sdl2` and `mojo` answer differently today).

Done by the owner's word of the same evening:
[the javascript package split](../20261013-135951-javascript-split/TASK.md)
(`quickjs`, `janis`, `typescript`, each holding its build).

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
