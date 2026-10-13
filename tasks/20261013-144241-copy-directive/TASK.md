# Investigate: COPY in the Dollyfile, and packages that are another image's files

- STATUS: OPEN
- PRIORITY: 288
- TAGS: core,dollyfile,packages,owner

Owner (2026-10-13), on
[the reflection](../20261013-142800-direction/reflection.md): "The audit is
too blunt. Some of the points are good but some are garbage. Both SLOP and
RUN are needed, see the history, this is hard earned wisdom. Create tasks to
investigate each of your points more in detail without deciding if they
should go or not".

This task investigates one of its points (section 3). It decides nothing.

Done when it holds, with the evidence and without a verdict:

- how the thing came to be: the commits and tasks that introduced it and
  changed it, quoted, and the reason each gives (`git log -S`, `git log
  --follow`, `tatr find`, the closed tasks);
- what it is for today and who uses it, counted from the code and the
  recipes, not from the reflection;
- each claim of the reflection below, checked: true, false or partly, with
  what was looked at;
- what would break, be lost or become harder if it changed, and what would
  get simpler, each shown on a real case;
- what could not be found out.

The owner decides what, if anything, follows.

## State (2026-10-14, 01:00): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read
`integrate/round-1013` `0155af64` and changed nothing. The integrator checked
its counts (108 rows, 19 source images, 5 relocations, 54 licence rows), six
of its commits and three of its quotes against the tree. It gives no verdict.
What it found:

- `COPY` is older than `INSTALL` and than packages. It was designed on
  2026-09-03 for one case modules did not solve ("build a complete SDK
  image, then derive a smaller runtime image containing selected files
  without rerunning or retaining the SDK's compiler and sources. That is a
  real multi-stage build, not a module dependency", `c4dbe3ad`), came with
  Dollyfile 3 (`99093739`, 2026-09-06), and Dollyfile 6 kept it on purpose
  beside the new `INSTALL`: "Still files only: multi-stage builds pick exact
  outputs" ([Dollyfile 6](../20261001-214000-dollyfile-v6/TASK.md)).
- The two sentences the reflection plays against each other have one commit
  (`8bfcd884`, 2026-10-05): "The same `COPY` rows in two recipes are a
  missing package", and `COPY` rows as one of three shapes of a package,
  "which leaves an expensive builder as it is". The first speaks of repeated
  rows: 6 distinct rows are repeated today (14 instances: FreeType, libpng
  and SDL2's licence, in `xonotic-build`, `wine-build`, `xonotic`,
  `zero-ad-deps`); 94 rows are used once.
- Four kinds of use: an application takes its program out of its build image
  (41 rows, 6 recipes); a package's contents come by `COPY` (45 rows, 9
  packages); a build image takes a library or a stage out of another image
  (19 rows, 5 toolchains); licence rows alone (3). Half of all rows, 54,
  copy licence files of libraries that were linked in statically.
- The reflection's numbers hold (24 of 79 "shadows" under the one rule that
  reproduces them; 23 of 77 in this tree). Its claim "declares no interface
  and builds nothing" is true of the row, and as true of the view form
  (`FROM` a builder and only `EXPORTS`) that the reflection prefers: all
  nine `COPY` packages declare their `EXPORTS` after the rows.
- Rows have gone when a package came (SDL2: 15 rows to 3 `INSTALL`;
  `transfer`: 4 to 1) and have come for other reasons: licences; a second
  source image (a recipe has one `FROM`); and `lua` went from the view form
  to eleven `COPY` rows on 2026-10-13 to get a manual page formatted on a
  base that has the formatter (`b74634a7`).
- Uses that have no equivalent in today's language without `COPY`: files
  from a second image when no package holds them (`mojo`, `xonotic`, `nvim`,
  `lua`, `rust-build`, `zero-ad-engine`; for the last, being `FROM` the
  SpiderMonkey build would bring Python, Cargo and cbindgen along);
  relocation in a recipe that has no base and so no shell (`llvm`, `mojo`);
  a licence without its library.
- Written out on real recipes (section 5): `nvim` as a view is about 14
  rows against 24 and loses its manual page; `xonotic-build` and
  `wine-build` could say `INSTALL libpng` and `INSTALL freetype` today (2
  rows for 5 and 8, and `REQUIRES LIB freetype` becomes possible), at the
  price of rebuilding both; a game as a package was ruled out on 2026-10-05
  ("nobody installs a game into a shell").
- Not found out: build memory and time of a package made by restoring a
  whole builder against `COPY` of chosen paths (never measured); what "which
  leaves an expensive builder as it is" was meant to say; whether a package
  keeps a `COPY` result its recipe later removes.

## What the reflection claims and proposes (2026-10-13, unchecked)

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
