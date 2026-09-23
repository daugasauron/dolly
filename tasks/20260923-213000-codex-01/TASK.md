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

Navigation experiments after checkpoint `776cd4e`:

The Sundial balance vehicle and Skybarge aircraft now choose destinations and
visits using seeded randomness and nearby physical actors, with collision
avoidance and yielding. A matched 180-second original/social comparison kept
both balance vehicles and the flyer alive. At identical one-second sampling,
Sundial travel increased 54.41 -> 78.35 m; the second copy 54.00 -> 72.27 m;
Skybarge 123.75 -> 222.05 m. The new paths cover both horizontal axes rather than
the original straight track / small figure eight. Balance minimum up was
0.9966 / 0.9943; flight minimum up 0.968.

A full 300-second population run with these two replacements kept all 33 objects
alive and recorded no removals. Sundial travelled 134.31 m with five arrivals and
16.4 s yielding; Skybarge travelled 364.97 m with twelve arrivals and 34.4 s yielding.
Reported meetings require the selected peer to still be nearby at arrival.
Evidence: `build/blockwalker-roam-proof/{baseline,social,full}-{trace.csv,world.json}`,
`comparison.json` and `build/blockwalker-roam2.log` (exit 0). The full physics run
compiled in Dolly and took 80.11 wall seconds for 300 simulation seconds. These
source changes are not yet repackaged into the preview. Boats, the biped and
mechanism-specific interactions still need work; do not treat this as completion.

The next 600-second population trial exposed a real interaction failure:
Sidelight fell at 330.6 s. Contact instrumentation identified only Amberguard
hitting its feet, beginning at 214.4 s. This also occurs with the original
population: 1250 contact samples over 360 s. Isolated Sidelight stayed upright
for 600 s (minimum up 0.9868), so the corrective action was traffic-aware
reversal/replanting in the heavy walker, not immobilizing or replacing the biped.

With that change, all 33 objects survived 600 s; Sidelight had **zero external
character contacts**, 41 measured steps, zero aborts and minimum up 0.98587.
Amberguard yielded 24 times, still travelled 419.22 m, and kept minimum up 0.98032.
Logs: `build/blockwalker-biped-cause1.log`, `build/blockwalker-traffic1.log`, both
exit 0; traces, controller memories and physical contact records are in
`build/blockwalker-biped-cause/` and `build/blockwalker-traffic-proof/`.

Kelpglass and Longwake now choose water destinations using terrain samples and
nearby bodies instead of repeating their fixed loop. In their first 600-second
trial they travelled 376.60 / 289.36 m with 19 / 10 arrivals and minimum up
0.9978 / 0.9976. Tidegate reacted to the approaching Twinspire boat (ID 19), and
Westwatch tracked the Vesper aircraft (ID 13). Those controllers also passed the
combined traffic trial. Source now contains these seven replacements; the image
still points at the earlier `776cd4e` checkpoint until the next package build.

The expanded driver/cargo check passed again after preserving deck-carrier
observations across restart and keeping the manual car out of the learned
library (`build/blockwalker-delivery3.log`, exit 0). The older first-resumed-sensor
issue is now being fixed and verified separately; keep that issue open until
its actual 60 Hz / 10 Hz first-input tests and integration check pass.

The navigation and restored-controller changes are now packaged in the local
preview: 232016491 bytes, SHA-256
`6cff6a40ea28bd635208437131542928e7213c6590cc0a537bd7bdc023e62ce9`.
`build/blockwalker-playground-image2.log` records the 23.0-second rebuild.
Integration/reopen passed (`build/blockwalker-playground-integration3.log`, exit
0). Its beacon assertion now measures tracking the actual aircraft instead of
the superseded periodic sweep: maximum observed bearing error 0.03605 rad,
head travel 0.13186 rad after initial acquisition. The restored-sensor issue is
closed with both first-input and integration evidence. Longer combined runs
across repeated restarts remain in progress; this playground task stays open.
