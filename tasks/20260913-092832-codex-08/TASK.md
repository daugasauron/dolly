# Move browser scenarios out of the shared harness

- STATUS: OPEN
- PRIORITY: 50
- TAGS: audit,cleanup,testing

No description.

## Evidence

[scripts/browser-harness.mjs](../../scripts/browser-harness.mjs) is 6,356 lines at `ff633f7`
and combines browser setup with many application-specific scenarios.
The repository already uses [test/fixtures](../../test/fixtures) for extracted scenarios.

The iteration review keeps this below the measured graph/build blockers. Moving
code between files does not itself shorten test runs. Extract only when it enables
independent scenario selection or makes a concrete change easier to maintain.

## Done when

- Extract the remaining substantial scenario bodies using the existing fixture pattern.
- Keep shared browser startup, transport, and orchestration in the harness.
- Preserve existing mode names and behavior; avoid introducing another test framework.
- Verify affected modes while extracting them.
