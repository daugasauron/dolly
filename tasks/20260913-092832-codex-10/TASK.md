# Recover workspace and configuration from saves across updates

- STATUS: OPEN
- PRIORITY: 150
- TAGS: audit,persistence,core

No description.

## Evidence

[Session loading](../../src/browser.mjs) requires exact runtime build and image identities.
After an update, saves can remain stored and exportable but unloadable.
[Session-file export/import](../../src/session-file.mjs) preserves the original identity and does not migrate it.
See [session semantics](../../docs/sessions.md).

This is a documented architectural limitation, not a claim that saved bytes were deleted.

## Done when

- Provide an explicit recovery path for workspace files and selected configuration into a newer image.
- Define what is copied and how conflicts are handled before applying changes.
- Preserve the original save and avoid silently applying an old system delta to an incompatible base.
- Verify cross-version recovery and preservation of the original save in a browser.
