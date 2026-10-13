# Investigate: the recipe language is parsed twice, by the engine and by the page

- STATUS: OPEN
- PRIORITY: 260
- TAGS: core,dollyfile,boundary

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

- The page parses the recipe language in JavaScript to compute a build's
  closure and its trust set (`hostRequirements`, `from`, `entry`):
  `dollyfile-view.mjs` 317 lines, `dollyfile-graph.mjs` 125,
  `image-build.mjs` 98. A second parser whose output is a trust decision.
- The engine already drives a fetch-on-demand loop for `INSTALL` rows
  (`ROW_FIRST`, `src/dollyfile.c:1329-1350`), which `amy` obeys; a packaged
  image's modules are read from the sealed artifact
  (`src/runtime-worker.mjs:111`), a custom one's from the page's own parser
  (`src/browser.mjs:114`).
- Engine (seed) and page.
