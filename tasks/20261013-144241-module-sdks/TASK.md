# Investigate: host modules' headers and clients in the seed, and what a host module is

- STATUS: OPEN
- PRIORITY: 270
- TAGS: core,host-modules,packages

Owner (2026-10-13), on
[the reflection](../20261013-142800-direction/reflection.md): "The audit is
too blunt. Some of the points are good but some are garbage. Both SLOP and
RUN are needed, see the history, this is hard earned wisdom. Create tasks to
investigate each of your points more in detail without deciding if they
should go or not".

This task investigates one of its points (section 2). It decides nothing.

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

- The compiler image knows every module: `Dollyfile-system-build:9-35,
  65-67` pins 24 headers of 10 modules and `scripts/build.sh:234` packs
  every `libdolly-NAME.a` into the seed. A module is then not "just a
  module": its header is the toolchain's.
- The page and the lint name modules: `src/browser.mjs:223` and
  `src/page-indicators.mjs:33-41` (being removed by
  [no CPU and GPU](../20261013-135951-no-cpu-gpu-category/TASK.md)), and the
  lint's display rule.
- Also here, the same idea: eighteen manifests are five kinds of thing
  under one name (seven devices with an import, four with a mailbox, two
  kernel features with no page side, a supervisor budget, a loader in the
  process's Worker, two page services, a runtime), and `sockets@0` and
  `pty@0` say `HOST` where no host is involved. The mechanism is right; the
  word is the owner's to weigh.
- Changes the seed's contents: the seed branch.
