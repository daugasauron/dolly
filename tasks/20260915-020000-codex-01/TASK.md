# Keep reusable programmed designs when creatures fall

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,agent,persistence

The original learned tripod walkers were removed after over an hour. The logs do not distinguish
posture failure from controller failure. World snapshots keep living creatures only, and the single workshop blueprint is
replaced while Pi experiments. Earlier designs are recoverable from external
backups but inaccessible inside the game.

Retain released blueprints and controllers together in a saved design library.
Deduplicate identical releases, restore older living-world designs into it, and
bundle measured examples so a fresh image can try boats, flyers, walkers,
cranes and the bridge. Provide a browser selector and direct Pi tools to reopen
and reuse a design without removing its existing world copies. Keep the C game,
ordinary in-Wasm storage and one Dollyfile.

Verify a design remains after its creature falls and after restart, duplicate
releases do not fill the list, and opening a saved design restores its actual
controller, body, materials and anchor. Exercise the selector and programmed
practice in the browser; keep automatic resurrection out of the survival rules.

## Verification, 2026-09-15 02:09 JST

Added a persistent library in the ordinary world save. Released designs retain
body, controller source/rate, anchor, material and preferred location; identical
copies deduplicate. Older world files populate the library from their surviving
creatures, and 13 measured Pi examples are bundled in the image. Native library
and open-design calls are exposed through direct Pi tools.

The browser selector opens the design and controller together. Test character
then Play program runs continuously without enabling Pi; Stop program/backtick
returns manual control. Water examples select sea trials, and resetting keeps
the chosen surface. The library uses fixed pages, avoiding row shifts when its
last page is short.

The C image compiled entirely inside Dolly. Final integration passed in Chrome:
a removed Toppler remains in the library, reopening it restores and executes
its hinge controller, identical Spinner releases share one record, and library
entries survive restart. A saved water design keeps water on reset. Existing
magnet/cargo restoration, boat, bridge and PID flight checks passed as well.

The editor suite passed with actual mouse/keyboard interaction: paged to the
boat, reopened all 19 parts/materials, and ran its saved controller without Pi.
At 244 physics steps it had moved 3.1306 m, with root y=-1.2906 m and up=0.99499.
Existing camera, under-floor placement, edits, key bindings and magnet UI checks
also passed; ordinary GPU readback was zero and no browser errors were reported.
Both suites ran separately under 4 GiB/no-swap process-tree limits.
Evidence: `build/slopyard-library-integration.log`,
`build/slopyard-library-editor.log`, `build/slopyard-proof/program-ui.json`,
`design-library.png` and `library-program-playing.png`.

The feature is built and verified. Preserve the current live Pi compaction before
migrating its session to this image; that continuation remains in the larger-world
task. Failure-cause diagnostics are tracked separately in
`tasks/20260915-021000-codex-01/TASK.md`.
