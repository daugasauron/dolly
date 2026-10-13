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
