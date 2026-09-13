# Save and restore named sessions for custom images

- STATUS: OPEN
- PRIORITY: 150
- TAGS: audit,persistence

No description.

## Evidence

[The save handler](../../src/browser.mjs) rejects uploaded custom images because they lack a supported named-session base identity.
Build result URLs identify browser-local [cached artifacts](../../src/image-artifact.mjs); they are not portable images or durable named sessions.

## Done when

- Bind a custom-image save to its exact recipe, base artifact, and filesystem delta.
- Restore a named session after closing and reopening its result tab.
- Retain or export the required base with the save, or report a missing base clearly without losing the save.
- Import remains an explicit data operation; restoring or opening an image remains deliberate.
- Verify the custom build/save/reopen workflow in a browser.
