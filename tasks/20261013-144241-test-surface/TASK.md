# Investigate: what every page ships for tests (__dolly, terminal-text.mjs, the shell's published result)

- STATUS: OPEN
- PRIORITY: 285
- TAGS: core,boundary,tests

Owner (2026-10-13), on
[the reflection](../20261013-142800-direction/reflection.md): "The audit is
too blunt. Some of the points are good but some are garbage. Both SLOP and
RUN are needed, see the history, this is hard earned wisdom. Create tasks to
investigate each of your points more in detail without deciding if they
should go or not".

This task investigates one of its points (section 4). It decides nothing.

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

- `window.__dolly` is defined on every page (`src/browser.mjs:226-230`), 24
  members with every module enabled; `src/terminal-text.mjs` (63 lines) and
  input's `submit`, `input`, `paste`, `key` (`host/input/input.mjs:489-495`)
  exist for tests; sixty-three test files use it, and outside tests two
  release scripts. Not reachable from Wasm.
- In the contract for the same purpose: `TERMINAL_PUBLISH_RESULT` and two of
  the six words of the terminal's mailbox (`abi/dolly-supervisor-0.wat`),
  produced only by Slop (`src/slop.c:5269`), consumed only by `submit()`
  (`host/input/input.mjs:284`).
- Two steps, the first with no image input: (1) the page side moves to a
  module the test harness injects; (2) the operation and the mailbox words
  leave the contract and Slop, which changes the seed and waits for its
  branch. The older task is
  [audit-24](../20260930-100000-audit-24/TASK.md); fold what it still holds
  into this one when step 1 is done.
