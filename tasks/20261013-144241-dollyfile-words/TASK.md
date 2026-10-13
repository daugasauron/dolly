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

## State (2026-10-14, 01:05): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read
`integrate/round-1013` and changed nothing. The integrator checked its row
counts against the tree (681 `REQUIRES TOOL`, 124 `HEADER`, 69 `LIB`, 0
`FILE`, 0 `ENV`, 14 `EXPORTS FILE`, 77 `EXPORTS FOLDER`, 40 `FOLDER`) and the
owner's quoted correction in its task. It gives no verdict. What it found:

- The owner has ruled on these words once already. Phase 3 of Dollyfile 6
  (`9fc8b997`, 2026-10-01, [the task](../20261001-214000-dollyfile-v6/TASK.md)):
  "`REQUIRES` and typed `EXPORTS` stay; `REQUIRES TOOL slop` goes. (Owner
  correction: the assertions are the explicit contract.)" The Dollyfile 6
  design kept the types as "namespaces" (`LIB curl` and `HEADER curl`
  coexist) and kept `REQUIRES FILE` and `ENV` knowing they were unused. The
  reflection read neither.
- Where the words come from: DOLLY 2 (`c4dbe3ad`, 2026-09-03) had modules.
  A `REQUIRES` of every type, `TOOL` too, had to name an export of an
  earlier module, and a `SLOP` row's program had to be named by a `REQUIRES
  TOOL` first. DOLLY 3 (`99093739`, three days later) kept the words and
  made the checks optional: `TOOL` looks on `PATH`. Phase 3 folded 61
  single-use modules into their recipes and pruned "Nothing else": that is
  why `REQUIRES TOOL cc` and `SLOP cc …` stand in one file today. The rows
  were written as a module's boundary.
- "Retention is said four ways" is four spellings with four meanings in
  time: `FILE /p` must exist at its row; `EXPORTS FILE name /p` is checked
  when the recipe finishes and may stand before its file; `FOLDER` takes
  the members present at its row; `EXPORTS FOLDER` takes them at the end.
  `python` uses both folder forms, each for its timing. The reflection's
  "181 of 364 `FILE` rows without a body" is wrong: 471 rows, 183 with a
  body, 288 without, 251 of those licences and manual pages.
- "One row later" is the exception. In `jq` the required tools are used 75
  to 82 rows later, after the download and the compile; in `neovim-build`
  `timeout` is required at row 176 and used at 210, after Neovim's build.
  A tool that a Makefile calls fails inside `make`, not at a row.
- For an application, `REQUIRES TOOL` is the only check at sealing of a
  command that only `init.slop` names (`pi-agent:17`, `REQUIRES TOOL pi`):
  the engine reads `ENTRY`'s words, not the script's body.
- Who reads an export's name: the engine (receipt, scope of whoever is
  `FROM` or `INSTALL`s it), the graph and the `/view/IMAGE/` page (which
  links a `REQUIRES` to its provider, and a `SLOP` row's first word to the
  tool's exporter through that edge), the lint's `ENTRY` check, seven
  tests. Not `amy`, not the start page, not the runtime. No recipe looks up
  an `EXPORTS FILE` name; 128 of 203 exported tools, 52 of 80 headers, 30
  of 59 libraries and 57 of 59 folders are required by nobody.
- Not found out: why DOLLY 3 dropped the mandatory provider (no commit
  message says); whether a `REQUIRES TOOL` row ever caught a mistake in a
  real build (112 commits touched such rows, none says so); how much time
  an early check saves.

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
