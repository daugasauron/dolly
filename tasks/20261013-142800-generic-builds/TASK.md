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

## State (2026-10-13, 23:50)

[The inventory](inventory.md) is made, by an agent that read all 133 recipes
and changed nothing. What it found:

- 31 of 79 packages hold no build: 22 are `FROM` a build image and compile
  nothing, 9 are `COPY` rows. 39 hold their build, 9 are data.
- Built more than once: sbase three times from one archive, IJG libjpeg in
  `xonotic-build` and `wine-build`, Zstandard in `mojo-llvm` beside the
  package `zstd`. The three LLVMs, the three Luas and the two Box3D differ
  for real reasons (three compilers' pins, versions, build options).
- The package set it proposes adds `libogg`, `libvorbis`, `libxml2`,
  `libsodium`, `icu`, `boost-headers`, `libjpeg`, `utf8proc`, `tree-sitter`,
  `lpeg`, `luv`, `lua5.5`, `premake`, `spidermonkey`, `transcribe`, `libffi`,
  `gmqcc`; ten build images go.
- SpiderMonkey written out in full: its recipe, the three of 0 A.D.'s six
  patches any build needs, that Dolly's 490-line patch is all the port's,
  and what stands in the way (its build tools,
  [which a package cannot name](../20261013-144754-build-needs/TASK.md);
  `pkgconf` and `zlib.pc` living in `zero-ad-deps`; a source without a pin
  of its own).

Its order, each step leaving every image building:

1. `.pc` files to their owners (`zlib`, `curl`, `sdl2`): repins nearly
   everything.
2. Leaf libraries hold their builds, no consumer changes: 8 views rewritten
   (`pkgconf`, `libpng`, `freetype`, `openal`, `libuv`, `lua`, `raylib`,
   `box3d`) and 13 added. 21 images, no build image touched.
3. Build images install them (`zero-ad-deps`, `xonotic-build`, `wine-build`,
   `gamedev-sdk`, `slopyard`, `mojo-llvm`): 15 images.
4. `spidermonkey`.
5. Engines on composed bases: `nvim`, `llama`, `transcribe`, `mojo`,
   `codex`, `llvm`.
6. `quickjs`, `janis`, `typescript`
   ([task](../20261013-135951-javascript-split/TASK.md), running).
7. `rust`, `cargo`.
8. `cmake`.
9. The root: `posix`, `git`, `ninja`, `transfer`, `amy`, `session-recover`,
   `zig`, `display` hold their builds and the base images compose them.

Taken tonight, one at a time: step 2, which touches no build image. Steps 1,
8 and 9 repin most of the catalog and are a round's work; they wait for the
owner's word.

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
