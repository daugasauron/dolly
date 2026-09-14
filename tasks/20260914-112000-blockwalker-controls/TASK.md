# Make Blockwalker joints controllable and expose camera controls

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: bug,game

The starter collapses quickly, seems disconnected, and barely responds to its
keys. Camera rotation in the builder is also difficult to discover.

Found: Box3D defaults to density 1000 kg/m³, giving each box a mass of 912.673 kg
against a 24 N·m motor. The old test accepted any joint motion, including motion
from falling, as evidence that the motor worked. Right-drag camera rotation
works in Chrome, but its instructions disappear behind subsequent status text.

Use sensible toy-scale masses, gentler gravity/drop, and verify motor-driven
motion in both directions under gravity, including braking on release. Measure
attachment separation during a sustained multi-joint run. Keep manual balance
and fully 3D physics. Expose persistent camera controls and verify them, keyboard
input, and the original editor workflow in a real browser.

Verified on `codex/blockwalker-20260914`:

- Set density to 1 kg/m³, gravity to 4 m/s², initial floor clearance to 0.165 m,
  and eight physics substeps. No balance or gait assistance was added.
- Actual Wasm motor fixtures for X/Y/Z held within 0.001 radians at idle,
  moved forward 1.20–1.23 radians and reversed to -1.11–-1.20 radians.
  Release stopped them within 0.048 radians; subsequent drift was under 0.01.
- The 40-second six-box run kept peak attachment separation to 0.00507 m;
  the welded blocks ended 1.0001 m apart and remained above the floor.
- Chrome 151.0.7922.71 on NVIDIA Blackwell passed the expanded browser workflow:
  visible camera buttons, right-drag, Alt + left-drag, scroll zoom, exact return
  to the builder view, held/released key feedback, and actual motor motion.
  Remapped Z/K input produced 1.412 radians of movement in the commanded
  directions, with peak joint separation 0.003162 m. No page errors.
- Export/import, undo, remapping, test/edit transition and restart still passed.
  Seven recipe tests passed and all 40 pinned recipes linted.
- The C image rebuilt inside Dolly in 7.7 seconds, reusing all nine bases.

Detailed local results and screenshots: `build/blockwalker-proof/`, including
`physics-check.log` and `results.json`. Preview: `http://127.0.0.1:9099/blockwalker/`.
