# Add broad turntables and rebuild the cargo-slinger crews

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: game,physics,builder,bug

The user reports unstable slingers and frequent collisions with their loaders.
Add selectable 1x1, 2x2, 3x3 and 4x4 turntables with physical mounting across
multiple neighboring blocks. Rebuild both crews around 3x3 bearings, separate
their working space and improve their industrial silhouettes/materials.
Keep loading, aiming and clearance decisions in editable character programs.

Implemented: broad bearings have a fixed square mounting plate, weld across
both mounting faces, and a separately motorized rotor. Even sizes have half-cell
centers. Placement reserves the whole footprint; resizing rejects disconnected
or obstructed layouts. Torque capacity scales with area. Base-mounted actuators
use the stationary attachment body for physics, rendering and sensor readings.
Character format 8 and design/world format 3 retain older-format readers.

Both Tengu slingers now have two 3x3 bearings, an open-frame mast, exposed rotor,
counterweight and retracting loading pedestal. The compact Koban shuttles sit
16 metres away, feed three spaced crates through a clear aisle, and withdraw
before the throwing arm approaches. Ammo selection excludes heavy cargo. The original 81 other placements are
unchanged; the catalog still contains 91 entries. Programs clamp motor commands
after physical disturbances and wait safely when a target leaves view.

The 100 N magnet could oscillate at its force limit while holding still.
Implicit damping stabilizes the existing finite-force spring; capture range,
break distance and equal reaction forces remain in effect. Its regression test
holds a 3.651 N load at 3.646 N, with speed 0.024 m/s after settling.

Verification:

- `test/slopyard-bearings-browser.mjs [source.tar]` compiles C inside Dolly.
  All four sizes rotate under load on all three axes, with maximum separation
  0.01177 m; reversed X/Z mounts also pass. Direct joint checks prove mounting
  across the base and rotor faces. A loaded world round-trip retains pose/mass.
  A base-mounted hinge stays stationary while the rotor turns; a base-mounted
  piston extends 1.5 m with 0.00048 m separation. The existing actuator suite
  passes. Browser clicks verify all sizes, face placement, rejected shrinking,
  undo, export and import. Evidence: `build/slopyard-bearing-proof/`.
- Final open-frame crew, 360 simulated seconds, including a loaded save/reopen
  and an aircraft leaving/returning: three reloads, three shots, all three
  crates physically contact the aircraft, no dropped loads or crew collisions.
  Maximum separation: slinger 0.00620 m, loader 0.01493 m. Evidence:
  `build/slopyard-launcher-wide-open-mast/proof.json` and its traces.
- The populated-world run exposed an unbounded turret command after
  a disturbance. With bounded commands and the final geometry both teams reload/fire, all 96 objects
  remain, four cargo deliveries complete, and crew collisions/controller errors
  are zero over 180 s: `build/slopyard-launcher-wide-final-populated/proof.json`.
- A closer heavy crate remains unrequested while all three light crates reload
  and hit, including loaded save/reopen: `build/slopyard-launcher-wide-light-only2/`.

Completed September 25, 2026. Image 29 is served at
`http://127.0.0.1:9099/slopyard/` by the owned preview service. C compilation
and `--check` ran inside Dolly. Image: 232599131 bytes, SHA-256
`d0ec8d9091babaa91a832b21e7353d1354037e1fd88708972c931df97f3408e1`.
Source archive SHA-256:
`185eea1b190b0ba8b21badfe41c922a196c3cfd154a5161477485c8cc670541f`.

Chrome and Firefox checks of the served image pass: all 91 programs/blueprints
match the catalog, both crews render correctly, and the old 125-object world
restores with its programs and delivery ledger retained. Browser errors and
model HTTP requests are zero. Evidence:
`build/slopyard-image29-preview/proof.json` and
`build/slopyard-image29-preview-firefox/proof.json`.

All six protected files (392379755 bytes, including the complete Pi history),
twelve other images and thirteen catalog entries remain unchanged:
`build/slopyard-image29-preservation.json`. Existing saved worlds retain
their own designs; a fresh session gets the replacement crews. No push or
public deployment was performed.
