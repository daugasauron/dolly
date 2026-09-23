# Complete the game library and export/import workflow

- STATUS: OPEN
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
`build/blockwalker-audit-20260923/library-save-without-controller.png` and
`world-import-via-only-import-button.png`. Code: `world_save_design`,
`export_character`, `import_character` and `character_save`. A full Dolly session is a working alternate
container, but it is not an individual design exchange flow.

Allow library storage of an unprogrammed blueprint without requiring Pi. Define
a clear round-trip format/action for programmed designs and worlds; preserve
controller source/frequency, materials, bindings and anchoring, and distinguish
editing a design from replacing the live population. Verify round trips from
a fresh game and rejection of invalid imports without losing existing work.
