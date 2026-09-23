# Make Blockwalker a drivable, social cargo playground

- STATUS: OPEN
- PRIORITY: 250
- TAGS: game,physics,controls

Work through 2026-09-24 18:00 JST on the user-requested playground. Preserve the
retro reconciliation and learned-world recovery on their existing checkpoint
branches. Current work: `codex/blockwalker-playground-20260923`.

Completion requires:

- An Eyes block supplies an actual body-relative first-person view when entering
  a character in the shared world, with a way to return to the builder/viewer.
- A simple, easily controlled car is the fresh starting character. Driving uses
  physical motors, works with other world objects, and has clear controls.
- A Turntable block rotates attached assemblies continuously. A tilted mounting
  must work physically and visibly, with editable controls and saved designs.
- A meaningful cargo statistic and gameplay loop, with physical pickup/transport
  and delivery, visible feedback, persistent attribution and no repeated credit
  for the same cargo.
- Characters sense and interact with one another, choose varied destinations
  and move around substantially more. Demonstrate actual behavior, including
  safe handling of nearby actors/obstacles, rather than just random parameters
  on the same repeating path. Preserve demanding walkers as walkers.

Keep the game implementation in C, compile it inside Dolly and verify in one
bounded browser at a time (4 GiB, no swap). Lua/YAML migration remains the separate
requested issue; do not silently expand this goal into rewriting Pi.
Record actual controls, physics measurements, camera poses, scoring/save-reload
evidence and longer interaction runs before closing. Do not replace the user's
learned session with a test world.

2026-09-23 first playable checkpoint, still open:

- Fresh workshop is a nine-part magnetic car. Drive in world adds a physical
  manual copy; WASD drives, E/Q latch/release, Backslash switches Eyes/follow.
  The mounted camera follows all three body rotations at 72 degrees FOV.
- Eyes (6) and Turntable (7) preserve the earlier block IDs; blueprint version 6
  still reads versions 1–5. Turntables use unlimited revolute motors and thin
  cylindrical collision shapes, carrying their attached rigid assemblies.
- Striped depots accept transported, released, settled cargo once. A persistent
  delivery record attributes each crate to its carrier. Player credit survives
  replacing the driven character. Cargo supported on decks also finds its carrier.
- Controllers can inspect 12 nearby objects within 48 m, including body bounds,
  velocities and cargo state, plus depots and 16 surrounding terrain samples.
  Existing catalog programs have not yet been converted to use those readings.

Evidence: `build/blockwalker-playground-proof/physics.log` records car forward
travel 6.552 m and a turntable at 0.785 rad, 23.910 rad rotation and maximum
joint separation 0.00376 m. `test/blockwalker-driver-browser.mjs` compiles the
current C in Dolly, runs `test/fixtures/blockwalker-playground.c`, and exercises
actual keyboard input and cameras. Its first complete run is
`build/blockwalker-delivery2.log` (exit 0): car moved 10.44 m, 75 body-relative
Eyes samples, cargo physically attached and released, 35 objects / no removals.
`build/blockwalker-driver/cargo-physics.log` verifies pickup, restart while
loaded, delivery at z=34.215, no duplicate credit, save/reload attribution and
6.799 m of loose deck transport. `turntable-proof.json` and two GPU PNGs verify
rotation in a tilted plane: tip ranges 1.582 / 1.507 / 2.148 m.

Image rebuilt locally in 23.2 s (`build/blockwalker-playground-image1.log`),
232004695 bytes; runtime unchanged. Full editor and existing integration checks
are in progress. Pending: smarter roaming and interactions in the actual catalog,
longer combined runs and resulting polish. The live learned session is untouched.

The packaged image also passed the full editor regression and the existing
physics/embedded-controller/browser integration, including a fresh populated
world, PID hover, boats, cranes, controller timeout containment and exact saved
world restoration. Logs: `build/blockwalker-playground-editor1.log` and
`build/blockwalker-playground-integration1.log`, both exit 0. Image SHA-256:
`dfcbc9c3731e4d97108a2feaede68843d35878c7d8e13824a9864a87ec907ea4`.
Source tar: `e3cd746c8f02565b0010861352e63205aea797678859e0e7cd26a67919acbdd7`.
