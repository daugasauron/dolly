# The Dollyfile says each thing one way: what retains, what exports, what requires

- STATUS: OPEN
- PRIORITY: 290
- TAGS: core,dollyfile,owner

Owner (2026-10-13): "I want to get the core right, Dollyfile syntax, host
modules/bridge, browser runtime etc. It should be as clean and small as
possible in order to be extensible. Think unix philosophy (this is a core
thing)." One issue of
[the reflection on the direction](../20261013-142800-direction/TASK.md)
([reflection](../20261013-142800-direction/reflection.md), section 3).

Done when: `FILE` and `FOLDER` retain; `EXPORTS` names a `TOOL`, a `LIB`, a
`HEADER` or an `ENV`; `REQUIRES` names a `HOST`, a `LIB` or a `HEADER`; the
engine, the page's reader, the lint, the document and every recipe say so;
the catalog builds.

## As filed (2026-10-13, main `e330d782`, 133 recipes)

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
