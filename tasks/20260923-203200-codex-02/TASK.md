# Make durable game saves visible and distinguish them from in-memory saves

- STATUS: OPEN
- PRIORITY: 300
- TAGS: audit,game,ui,persistence

At aa28100 the game saves blueprints immediately and the world every ten
simulation seconds, but only into the in-Wasm filesystem. Durable browser
persistence requires the separate Dolly session action, Ctrl+Shift+S. The game
provides no visible session-save control or indication that progress is not yet
durable. Its library says a design is saved without explaining this distinction.

Browser reproduction: open a fresh `/blockwalker/`, enter World, drop cargo,
wait 11 s and export. It contains 54 objects. Refresh the page and export again:
53 original objects, with the new cargo gone. `dataset.session` was unset.
This is expected runtime isolation; the defect is the game-facing persistence
workflow, not a request to move userspace files into the browser host.

Evidence: `build/blockwalker-audit-20260923/ui-proof.json`,
`ui-{before,after}-refresh.json` and `build/blockwalker-audit-ui.mjs`.

Expose a clear durable save/load path using Dolly's existing session mechanism,
with visible unsaved/saved/failure state. Verify a blueprint edit and world change
survive refresh through that path. Keep failed saves explicit and preserve the
last good save. Coordinate with the existing large-session memory issue.
