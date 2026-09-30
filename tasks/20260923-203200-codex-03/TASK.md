# Complete the game library and export/import workflow

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: audit,game,ui,persistence

Three related gaps at aa28100 make user creations difficult to keep and share:

- Fresh hand-built characters cannot use Design library → Save current without
  first installing a movement controller. The UI rejects the valid starter body.
- Character Export writes the geometry/material/keybinding format only; the
  installed movement source and frequency are in the separate world JSON.
- Export world includes programs/state, but there is no matching world import
  action. The only Import button accepts character files and rejects world JSON.

The first and third paths were exercised in Chrome. Screenshots:
`build/slopyard-audit-20260923/library-save-without-controller.png` and
`world-import-via-only-import-button.png`. Code: `world_save_design`,
`export_character`, `import_character` and `character_save`. A full Dolly session is a working alternate
container, but it is not an individual design exchange flow.

Allow library storage of an unprogrammed blueprint without requiring Pi. Define
a clear round-trip format/action for programmed designs and worlds; preserve
controller source/frequency, materials, bindings and anchoring, and distinguish
editing a design from replacing the live population. Verify round trips from
a fresh game and rejection of invalid imports without losing existing work.

Implemented manual library entries (`source: null`), versioned design export
with program/frequency/surface/materials/bindings, and legacy `.character`
import. A separate Import world validates the complete saved population and
constructs its replacement before discarding the old world. It preserves the
workshop and keeps the previous world in `slopyard-world.previous.json`.
Backup or final-write failure rolls back; invalid input never replaces work.

Verified with C compiled inside Dolly and actual Chrome UI:
`test/slopyard-import-browser.mjs build/slopyard-import-source.tar`.
`build/slopyard-import2.log` exited 0: manual library use, programmed and
legacy designs, exact world round trips with a loaded magnet and with delivered
cargo, persistent credit, eight corrupt-world rejections, and backup/write
failure rollback. The editor regression check passed, including 160 parts,
under-floor placement, controls and reopening (`build/slopyard-import-editor1.log`,
exit 0). It now accepts a source tar to avoid rebuilding images for edits.

The same import check against the preserved recovery world's JSON also passed:
all 51 original creatures and 78 saved programs retained, including poses,
velocities, controller memory, seeds and three magnetic attachments.
`build/slopyard-import-legacy1.log` exited 0; its detailed C evidence and UI
screenshots are in `build/slopyard-import/`. The live learned session and
recovery files were not modified. Durable browser-save visibility remains the
separate open issue `20260923-203200-codex-02`.
