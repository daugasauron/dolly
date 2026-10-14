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

## State (2026-10-14, 10:10): investigated; one step done, the rest waits on one question

The five groups of [the inventory](inventory.md) were each investigated
(history first, each written out as a recipe, the integrator checking the
counts), and on the owner's word of 2026-10-14 ("If your investigation
confirms they are fixes … go ahead. If you're uncertain, give me a short
description") taken this way:

- Done: [the javascript split](../20261013-135951-javascript-split/TASK.md)
  (`quickjs`, `janis`, `typescript` hold their builds); `xonotic-build` and
  `wine-build` install `freetype` (round of 2026-10-14).
- Nothing to change, closed with the reason:
  [the engines](../20261013-145359-builds-engines/TASK.md),
  [what is compiled twice](../20261013-145359-builds-twice/TASK.md).
- His call: [what a package needs only to build](../20261013-144754-build-needs/TASK.md),
  which every candidate below meets, and
  [`amy`, Git, `download` and `upload` out of `system-tools`](../20261013-145359-builds-root/TASK.md).

The candidates for a package that holds its own build, each written out in
its investigation ([the views](../20261013-145359-builds-views/investigation.md),
[0 A.D.'s libraries](../20261013-145359-builds-zero-ad-deps/investigation.md),
[twice](../20261013-145359-builds-twice/investigation.md)):

- FreeType and libpng: upstream's CMake builds, unchanged, a dozen rows each
  on `cmake-build`; three images use them today.
- libjpeg: about twenty rows; Xonotic and NetSurf then share one flag set.
- SpiderMonkey, the owner's example: needs a base with Python, Rust, Cargo
  and cbindgen, or those arrive with whoever installs it.
- `openal` (options chosen for 0 A.D.; twelve images stand on its build
  image), `libuv` (82 images stand on `cmake-build`), `raylib` and `box3d`
  (Slopyard builds Box3D a second time with other options), a llama.cpp
  library (meets the host-module rule both ways).

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
