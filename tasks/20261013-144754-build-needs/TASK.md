# A package cannot say what it needs only to build: every INSTALL row is installed with it

- STATUS: OPEN
- PRIORITY: 255
- TAGS: core,dollyfile,packages,owner

Owner (2026-10-13): "I want to simplify and create as many reusable, good, no
shortcuts, packages as possible." An issue the
[inventory of builds](../20261013-142800-generic-builds/inventory.md) met,
about the language.

Done when: the owner has decided how a package names what it needs to build
and not to run, and the recipes follow; or has decided that a build base for
each combination of tools is the way, and the document says so.

## State (2026-10-14, 03:15): investigated, the owner's to decide

[The investigation](investigation.md), by a Fable agent that read `main` and
the five investigations of builds, and changed nothing (one report in two
parts; the other is
[a library package's host modules](../20261013-175624-library-hosts/investigation.md)).
The integrator counted the rows again (30 `INSTALL` rows in 23 package
recipes; the report says 24 recipes, one too many) and checked the engine's
host check, the comment of `tools-build` and the by-reference commit. It
gives no verdict. What it found:

- Nobody has proposed, tried or refused a build-only row before this task.
  The owner's words on dependencies are the question of 2026-10-13 ("They
  already specify requires etc? No need for new syntax to manage it?"),
  which led to installs by reference with no new syntax (`2283e960`), and
  his ruling on one row: `python` should not install `ninja`.
- The problem is older than installs by reference and was heavier before:
  until 2026-10-13 a package's `INSTALL` row copied the installed package
  into its own snapshot (`gzip` held `zlib`'s 275 KB; `cargo`'s 500 MB held
  `rust`'s 463).
- The 30 rows, read one by one: 19 are needed at run time by what the
  package ships (`cmake` starts `cc`; `zip -T` starts `unzip`; `tsc` reads
  Janis's scripts). 6 are libraries the package's program linked
  statically, which then arrive with it for nothing: `gzip`, `mandoc`,
  `pigz` and `sqlite` bring `zlib`; `tmux` brings `libevent` and
  `libterminfo` (851 KB in `tmux-panes`). 5 are neither cleanly: three are
  what a consumer of the package's library links (`freetype` brings
  `libpng`), `flex` brings `yacc` as a companion, and `python` brings
  `ninja`.
- The record of a row is its recipe's path and its pin, nothing else
  (`src/dollyfile.c:1151-1163`). A mark "for the build only" would be read
  in five places of the engine, three of `amy`, one of the page's graph,
  four test files and two sections of the document; the receipt and the
  index hold no rows.
- A second effect, not in the task as filed: a package must declare the
  host modules of every row, tools too. `zero-ad-spidermonkey` declares
  `dso@0`, `sockets@0` and `threads@0` for Python, Cargo and cbindgen;
  `meson` declares Python's three. As rows of a package, a build tool's
  modules would be asked of every installer.
- The bases that hold build tools today: `tools-build` (240 MB, 22 packages,
  made for exactly this on 2026-10-13, and its comment is the record of the
  problem), `cmake-build` for `sdl2`, `rust-build` for four packages.
- A change to a tool reaches the same images under a row and under a base,
  because pins cascade through recipe text; a base adds one image that
  restores and installs and compiles nothing.
- The tree already has three shapes that avoid the question: `COPY` out of
  a build image, a view, and static linking with the licence carried as a
  file. Section A4.6 sets side by side what each one states and what a
  reader, `amy` and a failing build see.
- Not found out: whether "no shortcuts" covers a base per set of tools;
  whether `python`'s `cc` row stays; the size and time of the bases that do
  not exist yet.

## As filed (2026-10-13, main `3721e1a0`)

- A package has one `FROM`, and each `INSTALL` row of its recipe is recorded
  and installed first by whoever installs the package, host modules
  included. So a tool that only the build needs (Python, Rust, CMake,
  mandoc) cannot be an `INSTALL` row: it would arrive with the library.
- What recipes do instead: a build image that exists to hold the tools and
  compiles nothing. `demos/tools/Dollyfile-tools-build` is `cmake-build`
  with mandoc, and its comment says why. SpiderMonkey as a package would
  need a `spidermonkey-build` holding Python, Cargo, cbindgen and pkgconf.
  Every new combination of build tools is one more such image.
- The question for the owner: is that the shape (a base is a composition and
  compiles nothing, a package is `FROM` the base it builds on), or should a
  recipe be able to say "install this for the build only"? The second is new
  meaning in the language; the first needs none and costs an image per
  combination.
- Related: `src/dollyfile.c:1401`, `keep = !(package_recipe && mode !=
  IMPORT_COPY)`: only a package's build keeps nothing of what it installs;
  a build image keeps the files of every package it installs.
