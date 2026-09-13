# Remove unused program demo sources

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: audit,cleanup

## Evidence

The `ff633f7` audit found no current build or test references to:

- `src/program-demo.c`, 71 lines.
- `src/program-cpp.cpp`, 37 lines.

These belong to the retired demo arrangement. Current private-process checks live under
[src/process](../../src/process) and [process-smoke.mjs](../../test/fixtures/process-smoke.mjs).

## Done when

- Confirm the files remain unused on the implementation revision and remove them.
- Current private-process fixtures and their coverage remain available.
- Build/source inventories have no references to the removed files.

## Resolution

Removed both orphan sources and the obsolete three-output cleanup in build.sh
(112 implementation lines). Checked all tracked scripts, recipes, source and
build configuration at 2c441d4: neither source was referenced or globbed into
a target. Current process fixtures remain; Chrome process-smoke already passed
the replacement C/C++/shared-files behavior during this revision's verification.
No image rebuild is required for deleting unreferenced files.
