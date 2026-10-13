# Investigate: SLOP and RUN, and build scripts written through FILE

- STATUS: OPEN
- PRIORITY: 250
- TAGS: core,dollyfile

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

The owner on this point: "Both SLOP and RUN are needed, see the history, this
is hard earned wisdom." Start from the history, not from the reflection: why
there are two, what each can do that the other cannot, and what was tried
before.

## What the reflection claims and proposes (2026-10-13, unchecked)

- `SLOP` is one line: 25 rows run a script that a `FILE` row wrote, and 9%
  of all recipe text is line continuations. `FILE` has the lexer a body
  needs (`src/dollyfile.c:1687-1700`).
- `RUN`: 5 rows, all in `Dollyfile-system-build:88-112`, to compile Slop
  before Slop exists; `bootstrap.c` already compiles `/bin/dollyfile` first
  and could compile Slop too.
- Engine in the seed and the recipes that use it.
