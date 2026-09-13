# Recover workspace and configuration from saves across updates

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: audit,persistence,core


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

## Implementation direction

Recover into a fresh shell image and a separate `/workspace/recovered-NAME`
folder. Copy changed/new regular files and directories from `/workspace` and
`/home`; leave system changes, deletion records and symlinks unapplied. Preserve
the original checkpoint, and make the recovered shell ask for a new save name.
This recovers configuration for inspection without automatically enabling old
startup files or credentials. A destination conflict must fail before copying.

Keep decoding and restoration in Wasm. Share the existing C delta decoder with
an ordinary `session-recover` command rather than adding a recovery-specific
kernel export or a browser filesystem API. Browser code should only pass the
bounded opaque delta to that command after an explicit recovery action.

## Resolution

Added an explicit Recover files action for incompatible format-2 saves. It opens
a fresh system image and runs an ordinary source-built C command using the
shared session decoder. No kernel export, process ABI or host filesystem API was
added. Recovery copies only workspace/home regular files and directories, leaves
the original checkpoint unchanged, refuses existing destinations, and asks for a
new session name on save. Configuration stays inert in the recovery folder.

Chrome and Firefox imported a real session exported by the earlier sealed local
release (runtime 7e819936…, image identity 0fc1f91…). Both recovered through the
actual UI into runtime b050e090… / image identity 0ace6dd9…, verified files and
exclusions, saved independently, reloaded the new checkpoint and verified that
the original record and bytes were unchanged (3.2 s / 4.6 s).

The full Chrome session mode also passed normal save during a running process,
resave, export/delete/import, base edits/deletions/type changes/symlinks, quota
and invalid-save failures, recovery conflicts, independent resave and legacy
routes. An ASan/UBSan regression covers malformed records, traversal, invalid
parents and the size limit; all 280 source checks pass in 3.11 s.

The command was compiled completely inside Dolly and installed in the system
image. All 18 selected images are current. Updating the native Zig seed alongside
this change rebuilt only Ghostty and interactive consumers; CMake, SDL, Neovim
and Rust producer snapshots were reused. The shared kernel decoder refactor
previously passed normal restore and the Chrome/Firefox core gate before the
image recipe changed.
