# Save and restore named sessions for custom images

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: audit,persistence


## Evidence

[The save handler](../../src/browser.mjs) rejects uploaded custom images because they lack a supported named-session base identity.
Build result URLs identify browser-local [cached artifacts](../../src/image-artifact.mjs); they are not portable images or durable named sessions.

## Done when

- Bind a custom-image save to its exact recipe, base artifact, and filesystem delta.
- Restore a named session after closing and reopening its result tab.
- Retain or export the required base with the save, or report a missing base clearly without losing the save.
- Import remains an explicit data operation; restoring or opening an image remains deliberate.
- Verify the custom build/save/reopen workflow in a browser.

## Result

Named custom-image saves now bind the exact Dollyfile, completed image digest,
input digests and opaque Wasm filesystem delta. Both rebuild and completed-result
tabs save and reopen through /session/NAME after closing the original tab. Export
and import preserve the bounded custom metadata. Restore verifies recipe/base
bytes and intersects saved HTTP restrictions with the current embedding policy.

The base remains in the existing browser image cache, not duplicated into each
checkpoint or export. Missing/changed bases fail without changing saves; the list
reports the missing image and offers workspace/home file recovery. Rebuilding the
exact original recipe restores access to the same checkpoint. Importing a session
file into another browser alone does not install that custom image.

`npm run test:custom-sessions` uses the existing Playwright/browser server and
current artifacts; it prepares no sources or distribution images. Chrome passed
in 14.9 s, Firefox in 20.4 s. The test compiles an actual C command from pasted
and uploaded recipes, rejects invalid/oversized uploads, saves with Ctrl+Shift+S,
reopens closed build/result tabs, restores base edits/deletions/symlinks, exports
and imports, tests looser/stricter network embeddings and wrong source identity,
removes the cached base, recovers files, then rebuilds the exact base and restores.
The Firefox-only command passed again in 20.4 s. The full suite uses this expanded
workflow; the existing custom-dollyfile harness mode remains available.

All 284 source checks pass in 2.78 s. The existing packaged-session browser mode
also passes saving during a running child (8.39 MB delta captured in 510 ms),
credentials/history/base changes, export/import/recovery, quota failures,
corrupt/missing/wrong-base records and legacy links. No Wasm import, ABI or native
image changed for this feature.
