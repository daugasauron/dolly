# COPY leaves the Dollyfile: a build's output enters the catalog only as a package

- STATUS: OPEN
- PRIORITY: 288
- TAGS: core,dollyfile,packages,owner

Owner (2026-10-13): "I want to get the core right, Dollyfile syntax, host
modules/bridge, browser runtime etc. It should be as clean and small as
possible in order to be extensible. Think unix philosophy (this is a core
thing)." One issue of
[the reflection on the direction](../20261013-142800-direction/TASK.md)
([reflection](../20261013-142800-direction/reflection.md), section 3).

Done when: no recipe takes files out of another image with `COPY`; what was
copied is a package, held by its own build or, until it is, a view that
names what it exports; the directive is gone from the engine, the page's
reader, the lint and the document.

## As filed (2026-10-13, main `e330d782`)

- 108 `COPY` rows out of 19 images (`neovim-build` 23, `zero-ad-deps` 15,
  `wine-build` 15); 5 of them relocate a file. A `COPY` row declares no
  interface and builds nothing, so a build image serves as a library, and
  24 of 79 packages are shadows of a build image (20 views, 4 `COPY` roots).
- `docs/dollyfile.md:262` already says "the same COPY rows in two recipes
  are a missing package"; without the directive that sentence is the
  language.
- It follows [builds become generic](../20261013-142800-generic-builds/TASK.md):
  the rows go as their packages come. The directive itself is the owner's
  to confirm.
