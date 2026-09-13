# Make Janis compatibility placeholders explicit

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: audit,compatibility


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

## Resolution

Implemented IPv4/IPv6 literal classification, including compressed and mapped
IPv6 and zone identifiers. A focused differential check compares the real Janis
runtime with Node across valid/invalid literals and compression forms. It failed
against the placeholders and passes after the change. Unsupported readline cursor
and keypress operations now raise ENOSYS instead of reporting silent success.

The pinned Pi dependency sources use IP classification for node-fetch referrer
handling, proxy host/SNI formatting and undici address checks. Pi's terminal
implementation emits its own ANSI cursor sequences; it does not call the four
readline placeholders. The existing asynchronous server listen failure is kept
so upstream login code can take its manual fallback.

Actual Wasm Janis passed IP classification, explicit terminal failure and
asynchronous socket fallback checks in Chrome and Firefox. The rebuilt Pi TUI
passed its local HTTP provider workflow: incremental SSE, thinking animation,
write/edit tools, UTF-8 file content and clean exit. All 282 source checks pass
in 2.80 s. The five affected JavaScript/Pi/Studio images were rebuilt in Dolly;
the system, compiler bases and Rust tools were reused.
