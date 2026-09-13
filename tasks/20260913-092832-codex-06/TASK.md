# Remove unused program demo sources

- STATUS: OPEN
- PRIORITY: 100
- TAGS: audit,cleanup

No description.

## Evidence

The `ff633f7` audit found no current build or test references to:

- [src/program-demo.c](../../src/program-demo.c), 71 lines.
- [src/program-cpp.cpp](../../src/program-cpp.cpp), 37 lines.

These belong to the retired demo arrangement. Current private-process checks live under
[src/process](../../src/process) and [process-smoke.mjs](../../test/fixtures/process-smoke.mjs).

## Done when

- Confirm the files remain unused on the implementation revision and remove them.
- Current private-process fixtures and their coverage remain available.
- Build/source inventories have no references to the removed files.
