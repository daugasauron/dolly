# Make Janis compatibility placeholders explicit

- STATUS: OPEN
- PRIORITY: 150
- TAGS: audit,compatibility

No description.

## Evidence

[Janis's builtin module map](../../src/runtimes/janis.js) includes callable placeholders:
`net.isIP` always returns 0, `isIPv4`/`isIPv6` always return false, and several readline cursor
functions return success without performing the requested operation.
The source-runtime probe returned 0 for `net.isIP("127.0.0.1")`.

An imported symbol is not proof that its behavior works. Some placeholders may be needed for upstream fallback detection;
their use must be checked before removal.

## Done when

- Review these placeholders and identify their actual callers and fallback expectations.
- Implement the deliberately supported behavior, or fail explicitly where it is unsupported.
- Preserve intentional feature-detection/fallback behavior.
- Add focused compatibility checks and verify affected Pi/Janis workflows in a browser.
