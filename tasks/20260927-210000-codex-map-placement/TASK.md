# Place anchored workshop structures on team ground

- STATUS: CLOSED
- PRIORITY: 280
- TAGS: game,builder,placement

Anchored builds currently cannot leave the workshop through the player action.
Add a world placement preview with Blue/Neutral/Red selection, confirmation and
cancellation. Use the terrain version's visible team boundaries; require the
whole structure to stay on its selected ground, with neutral structures in the
middle. Seat the root on solid terrain, including roofs, and reject overlapping
terrain or existing characters. Preserve the installed Lua program, selected
team and physical placement in world exports/restores. Create initial bodies at
the chosen pose without ongoing position corrections.

Verify supported ground and roof placement, opposing/neutral boundary rejection,
water/unsupported footing and collision rejection, cancel without world changes,
program execution and save/restore. Exercise the actual builder UI in a browser.
Compile C only inside Dolly. Older terrain versions keep their original widths.

Implemented typed world placement validation, translucent preview and team selection,
click/Enter confirmation and Esc cancellation. New structures retain the installed
Lua controller and selected paint/team; collision bodies start at the chosen pose.
Full assembly bounds include multi-block turntables' lower support plates. Optional
`startY` metadata preserves controller home height when restoring roof placements.
Terrain 8 opens a second map bookmark page for the roof decks and shared sea berth;
saved terrain 6/7 retains its original combat width and tint.

Focused real Dolly verification passed on 2026-09-27:
`test/fixtures/slopyard-placement.c`, compiled inside wasm64 and run in Chrome.
Evidence: `build/base-zones-20260927/placement-v1/terminal.log` and `proof.json`.
It checks all three teams, complete-footprint bounds, unsupported/water/occupied
positions, missed-ray cancellation, actual roof support, lower turntable plates,
real Lua-driven hinge movement with a stationary root, and world save/restore of
program/team/root height.

The first UI run exposed a seam-specific ray failure that vertical-only placement
checks missed. At x=-54, a camera ray with zero X direction made Raylib's box test
miss both adjacent ground slabs and hit the seabed at y=-12; diagnostic output is
in `build/base-zones-20260927/placement-seam/terminal.log`. Placement now handles
parallel ray axes explicitly and classifies top faces by their actual height.
The physical fixture includes this exact oblique seam ray. The initial UI harness
was also corrected to observe ordinary in-Wasm state-file downloads, avoiding
terminal reads during active GPU presentation.

Final verification: `build/action-front-20260927/placement/ui-v4/physical.log`
passes the physical fixture with the exact parallel-axis seam regression.
`ui-v4/proof.json`, exported worlds and screenshots prove actual browser clicks:
Blue/Red/Neutral selection, click and Enter confirmation, cancellation, occupied
and opposing-ground rejection, and installed Lua execution. WASD/QE camera movement
followed by the Place button puts a real anchored structure on the Red roof at
root Y=16.485, preserving its team and `startY`. The second map-bookmark page works.
The run exits cleanly with no browser errors. Both C programs were compiled inside
Dolly; no image rebuild or host compiler was used. Screenshots were inspected.

Reproduce the combined check with the prepared UI runner and source archive:
`SOURCE_TAR=build/action-front-20260927/placement/source-v3.tar`, then run
`build/action-front-20260927/placement/ui-browser.mjs ui-v4` under the documented
single 4 GiB Xvfb/Chrome scope (Node `--preserve-symlinks --preserve-symlinks-main`).
The committed physical fixture also runs against current source through
`node test/slopyard-controller-browser.mjs test/fixtures/slopyard-placement.c`
in the same browser scope.
