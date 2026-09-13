# Delete behavior-related source assertions and keep useful coverage

- STATUS: OPEN
- PRIORITY: 250
- TAGS: audit,cleanup,testing

## Evidence

At `ff633f7`, [test/dolly.test.mjs](../../test/dolly.test.mjs) contains 593
`assert.match`/`assert.doesNotMatch` calls. Source spelling often cannot establish runtime behavior
and can make harmless refactoring expensive. Structural assertions enforcing the browser boundary have a distinct purpose.

The iteration review removed 65 lines in this worktree: checks for names/wording
inside browser tests, Janis cleanup function spelling, prompt/recovery messages
and one exact theme color. These never exercised the behaviors they purported to
protect. Existing browser scenarios were retained. This is an initial deletion,
not completion of the file-wide review.

Validation: this branch's test/dolly.test.mjs passed 56/56 before deletion and
54/54 afterward. Deployed main's full Node baseline passed 335 checks in 32.8 s.
Do not attribute the different local before/after timings to the deleted checks:
they cost milliseconds; graph/catalog inspection dominates this file's overhead.

Mocks alone are not a deletion criterion. The browser startup EventEmitter and
timer tests exercise real timeout/cleanup logic cheaply; seed packaging tests
compare actual emitted files; exact Wasm imports/exports enforce the boundary.
Janis scratch cleanup still needs observed success/error cleanup evidence if it
is to be claimed as covered; matching a function call never established it.

## Done when

- Delete remaining behavior-related source spelling checks. Add an observable check only for a material uncovered regression; do not replace each deleted assertion with another test.
- Remove redundant assertions already covered by behavior tests.
- Retain structural checks for exact imports, forbidden host capabilities, and other deliberate boundary rules.
- Use the existing test infrastructure and measure feedback time. Pair this work with the [graph inspection fix](../20260913-105436-codex-13/TASK.md).

The graph fix also removed 14 lines asserting the builder/pruner helper function
names. Actual snapshot identity and browser cache-invalidation checks cover the
contract; spelling the shared helper's name does not.

The compiler-base change also removes a 29-line seed test that inspected source
spelling (real seed inventory and browser compilation checks remain), viewer
helper-name assertions, and duplicate hardcoded image/menu lists. Registry checks
compare generated entries with discovered recipes; actual menu layout remains
covered in Chrome. All 333 Node tests pass with the rebuilt core image selection.
