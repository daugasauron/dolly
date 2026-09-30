# Make durable game saves visible and distinguish them from in-memory saves

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: audit,game,ui,persistence

At aa28100 the game saves blueprints immediately and the world every ten
simulation seconds, but only into the in-Wasm filesystem. Durable browser
persistence requires the separate Dolly session action, Ctrl+Shift+S. The game
provides no visible session-save control or indication that progress is not yet
durable. Its library says a design is saved without explaining this distinction.

Browser reproduction: open a fresh `/slopyard/`, enter World, drop cargo,
wait 11 s and export. It contains 54 objects. Refresh the page and export again:
53 original objects, with the new cargo gone. `dataset.session` was unset.
This is expected runtime isolation; the defect is the game-facing persistence
workflow, not a request to move userspace files into the browser host.

Evidence: `build/slopyard-audit-20260923/ui-proof.json`,
`ui-{before,after}-refresh.json` and `build/slopyard-audit-ui.mjs`.

Expose a clear durable save/load path using Dolly's existing session mechanism,
with visible unsaved/saved/failure state. Verify a blueprint edit and world change
survive refresh through that path. Keep failed saves explicit and preserve the
last good save. Coordinate with the existing large-session memory issue.

Verified 2026-09-24: the browser's visible Save button opens a named checkpoint
dialog with a saved-session link. It reports fresh/restored/last-save/failure
state and explains that later changes need another save. It reuses the existing
opaque filesystem snapshot and atomic IndexedDB replacement; no new game ABI.

`test/slopyard-session-browser.mjs` passed in Chrome under the 4 GiB/no-swap
limit (`build/slopyard-session2.log`, exit 0). A real workshop finish edit,
driven car and dropped cargo survived refresh. Dialog typing stayed out of the
game, held driving keys were released, Escape closed only the dialog, and F11
kept input focus. A quota failure at IndexedDB put preserved the last good
checkpoint's hash and timestamp; refresh restored it. A subsequent named
Ctrl+Shift+S replaced the checkpoint and restored the newer cargo count.
Screenshots and measurements: `build/slopyard-session/`; initial compressed
save 231695 bytes. The rebuilt image passed again against the actual 9099
preview (`build/slopyard-session3.log`, exit 0), including opening the dialog
with Ctrl+Shift+S while driving. The separate large-session memory issue remains open.
