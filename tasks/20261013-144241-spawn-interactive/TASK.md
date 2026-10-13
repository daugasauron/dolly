# Investigate: SPAWN_INTERACTIVE, and where the rule for Ctrl+C at a shell lives

- STATUS: OPEN
- PRIORITY: 280
- TAGS: core,process,abi,slop

Owner (2026-10-13), on
[the reflection](../20261013-142800-direction/reflection.md): "The audit is
too blunt. Some of the points are good but some are garbage. Both SLOP and
RUN are needed, see the history, this is hard earned wisdom. Create tasks to
investigate each of your points more in detail without deciding if they
should go or not".

This task investigates one of its points (section 1). It decides nothing.

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

- "An interactive owner with running descendants is spared"
  (`include/dolly/process.h:181`), implemented twice
  (`src/process-supervisor.mjs:275-279`, `src/process-kernel.c:180-195`):
  a shell's decision about how Ctrl+C reaches it, written as a spawn flag.
  POSIX says the same with `SIG_IGN`, which `src/process/signal.c:107`
  already honours. `SPAWN_FOREGROUND` is mechanism (who owns the terminal)
  and stays.
- Not judged by reading: whether Slop can ignore `SIGINT` across its wait
  cleanly without the flag. Measure that first.
- `process.h` and `slop.c` are in the seed: its commit goes on the seed
  branch, tested on the base chain.
