# Investigate: runtime.h beside libc

- STATUS: OPEN
- PRIORITY: 245
- TAGS: core,process,abi

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

- 19 functions. `dolly_isatty`, `dolly_kill`, `dolly_waitpid`,
  `dolly_terminal_mode_*` and `dolly_write_file` duplicate libc
  (`src/process/libc-adapter.c:51` is `isatty() { return dolly_isatty(); }`);
  six spawn wrappers of one call (`runtime-adapter.c:123-178`). Callers
  outside `src/process`: seven demo files, Slop, `dollyfile.c`, `amy.c`.
- Whether `dolly_terminal_publish_result` stays is
  [the test surface](../20261013-144241-test-surface/TASK.md)'s question.
- Seed.
