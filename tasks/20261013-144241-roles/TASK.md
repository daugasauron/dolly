# Investigate: the Dollyfile's three roles, APPLICATION, TOOLCHAIN and PACKAGE

- STATUS: OPEN
- PRIORITY: 240
- TAGS: core,dollyfile,owner

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

- The engine tells `APPLICATION` from `TOOLCHAIN` by one check, "missing
  ENTRY" (`src/dollyfile.c:1810`); 32 of 34 toolchains have an `ENTRY` and
  open; both can be a `FROM` base. The split that matters is at 1401: a
  package keeps nothing of what it is built on.
- The lint's "an APPLICATION needs display@0"
  (`scripts/lint-dollyfiles.mjs:68`) names a module where "has an ENTRY"
  says it.
- A change to the language: the owner's to confirm.
