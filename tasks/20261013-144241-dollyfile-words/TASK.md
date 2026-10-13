# Investigate: the Dollyfile's ways to retain, to export and to require

- STATUS: OPEN
- PRIORITY: 290
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

## What the reflection claims and proposes (2026-10-13, unchecked; 133 recipes)

- Retention is said four ways: `FILE /p` without a body (181 of 364 `FILE`
  rows), `FOLDER` (41), `EXPORTS FILE name /p` (18; `REQUIRES FILE` is used
  0 times, so the name is read by nothing), `EXPORTS FOLDER name /p` (78;
  required twice).
- `REQUIRES TOOL` is 678 rows, the largest class after `SLOP`; it resolves a
  name on `PATH` (`src/dollyfile.c:1586-1589`), which the first `SLOP` that
  uses the tool does one row later; 73 rows say `cc`, 71 `tar`.
  `REQUIRES ENV` has code (1585) and 0 uses. `REQUIRES HEADER` and `LIB` look
  up an export (1591-1594): that is the check of an interface, and it stays.
- It changes the language (`DOLLY 7`), the engine in the seed and about 700
  rows: the owner's to confirm before a row is touched, then one branch with
  the other changes to the language.
