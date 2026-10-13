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
