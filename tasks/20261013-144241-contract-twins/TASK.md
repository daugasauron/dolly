# Investigate: operations of the process contract that look like twins, and how modules get their operation numbers

- STATUS: OPEN
- PRIORITY: 235
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

- 50 operations (`include/dolly/process.h`). Twins: `FD_STAT`/`PATH_STAT`,
  `FD_STAT_FILESYSTEM`/`PATH_STAT_FILESYSTEM`, `FD_SET_TIMES`/`PATH_SET_TIMES`
  though the path request already carries `directory_descriptor`
  (586-592); `ARGUMENT_SIZES` with `ARGUMENTS`; `CLOCK_RESOLUTION` returns a
  constant (`src/process-kernel.c:2201-2215`). Three conventions of packet
  in one contract: `TERMINAL` alone multiplexes six sub-operations
  (298-305), `FD_LOCK` alone changes its response by a flag (157-159).
- `download` uses operation 51 and `upload` 57, inside the core's 48-59;
  `process.h:110` says "never reuse a number below" and nothing says where
  a module starts. `test/host-modules.test.mjs:114` already checks
  collisions.
- Seed.
