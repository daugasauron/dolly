# Investigate: the recipe language is parsed twice, by the engine and by the page

- STATUS: CLOSED
- PRIORITY: 260
- TAGS: core,dollyfile,boundary,owner

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

## Closed (2026-10-14)

Owner (2026-10-14), on the tasks that waited for him: "I'm not gonna go
through 35 tasks, I'm sure some are not relevant anymore and some are
confirmed actual good fixes. If your investigation confirms they are fixes
that improve things and aligh with the main goal of the project go ahead. If
you're uncertain, give me a short description".

Nothing changes. The page parses because a build's base holds the engine, so
the base must be there before a row can be read. Everything the page trusts
is hashed recipe text, the two parsers run 232 cases in common, and one
grammar was proposed and rejected by the owner. The gap it met,
[nothing compares the engine's module list with the page's](../20261013-170737-receipt-hosts/TASK.md),
is put to the owner as one question.

## State (2026-10-14, 02:10): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read
`integrate/round-1013` and changed nothing. The integrator checked the three
line counts, the first commit's document, the code that derives a sealed
image's modules, the one JavaScript line that touches the engine's receipt,
and `amy`'s loop. It gives no verdict. What it found:

- The JavaScript parser is as old as the language (`9e013dd9`, 2026-08-31),
  then for Node and a viewer only: "The browser does not parse or execute
  build rows. JavaScript only discovers image names for routes and renders
  source text for the viewer." The page began to parse with DOLLY 3
  (`99093739`, 2026-09-06), the commit that made an image a complete
  artifact the page has to supply before the engine runs.
- Why the page must know a build's inputs before the kernel runs is
  mechanical: a `FROM` base is restored as the kernel's filesystem before
  `/bin/dollyfile` is started, and that engine is inside the base ("The
  build runs the base's `/bin/dollyfile`", `docs/dollyfile.md`); every
  `INSTALL` and `COPY` snapshot is a file the page writes before the start;
  a builder has no service to ask.
- The "fetch-on-demand loop" is `amy`'s, not the engine's. The engine ends
  with status 3 naming one row; `amy` fetches it through `packages@0` and
  asks again. In a build the same status is a failure. And the page answers
  only for pins that the registry lists as packages, a list the JavaScript
  parser wrote.
- The module list the page trusts is the JavaScript parser's output on
  every path: the registry, the packaged metadata, and for a rebuilt or
  custom image the recipes kept inside the sealed snapshot, parsed again in
  JavaScript (`src/image-artifact.mjs:184-191`). The engine seals its own
  list into its receipt (`/etc/dolly/artifact`); no JavaScript reads it. So
  "read from the sealed artifact" in the reflection is not the engine's
  word either.
- Under the threat model every input to that decision is recipe text whose
  hash the page holds (the root against its own digest, each recipe of the
  chain against the pin in its parent). A compromised build cannot widen
  the module set without breaking SHA-256.
- The two parsers were made to agree after a real disagreement
  ([audit 48](../20260930-100000-audit-48/TASK.md), 2026-09-30: JavaScript
  refused `gpu@0` with `gpu@1`, C accepted). Since then 232 cases run
  through both, the C side as a native build of the real `dollyfile.c`. A
  proposal for one grammar was "written and rejected by the owner"
  ([audit 50](../20260930-100000-audit-50/TASK.md)); his words on two
  parsers were not found.
- Facts only the JavaScript parser can know when they are needed: a custom
  image's modules before any Wasm exists; a build's base before the kernel
  can be resumed from it; the modules of a packaged image on its ordinary
  route, where the engine never runs; the order of 130 builds in Node
  before any browser starts.
- Met on the way: at packaging the engine's lock, kept recipes and `ENTRY`
  are compared with the JavaScript graph for every image
  (`scripts/snapshot-identity.mjs`); the engine's module list in the receipt
  is not compared with the page's, so a disagreement on a live recipe there
  would go unnoticed
  ([a task](../20261013-170737-receipt-hosts/TASK.md)).
- Not found out: whether a Wasm build of the engine's parser for the page
  or Node was ever weighed; why Node parses in JavaScript; why the receipt
  carries a list nothing outside the engine reads.

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
