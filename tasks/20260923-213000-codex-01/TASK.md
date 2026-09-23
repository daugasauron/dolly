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

Checkpoint `845164d` then survived 1800 simulation seconds with a fresh process
and world reload every 300 seconds: all 33 objects alive, zero removals. Sidelight
completed 124 steps (62 per foot), zero aborts, minimum sampled up 0.9868 and
zero external character contacts across all six segments. Sundial travelled
843.95 m / 26 arrivals / four meetings; Skybarge 2219.17 m / 80 arrivals / eleven
meetings; Kelpglass 1543.61 m / 97 arrivals; Longwake 717.08 m / 22 arrivals.
Evidence: `build/blockwalker-long-resume1.log` (exit 0), all six saved worlds,
contact records and traces plus `result.json` in `build/blockwalker-long-resume-0/`.
Separate prototypes now test a longer traffic-aware biped patrol and a courier
that delivers to the depot instead of recycling the same cargo between two
points. Neither prototype is part of this verified image yet.

The next full-population 600-second trial kept all 34 objects alive, including a
second crate added at 90 s. The courier delivered crates 11 and 34 to the Island
depot at 24.23 and 121.90 s. It then returned to searching for available cargo.
The first trial exposed a blocked descent above an existing crate; the corrected
controller senses the stack height, and scoring now requires physical upward
support rather than bare-floor height. Delivered cargo still reports its current
carrier when picked up again, without awarding duplicate credit.

The longer biped patrol covered a 9.49 m range and yielded seven times. It made
38 qualifying steps; two landings missed the strict slip/support criteria but
the body continued walking (minimum up 0.98208, zero external contacts). Its
isolated 600-second trial had 41 steps, no aborts and 10.86 m range. Evidence:
`build/blockwalker-candidates{1,2,3}.log`, all exit 0, and matching
`build/blockwalker-candidate{,2,3}-proof/` traces and worlds. Both programs are now
in the source catalog; the gait mechanics and all character geometry are retained.

The expanded driver check passed with current sources compiled inside Dolly:
`build/blockwalker-cargo-stack1.log` (exit 0). It includes two physical courier
deliveries with a restart between them, a 0.970 m crate stack, persistent score,
real reacquisition without duplicate credit, all four first-resumed-feedback
cases, driving 10.31 m, 75 Eyes samples and the tilted turntable.
The local image was rebuilt in 23.4 s (`build/blockwalker-playground-image3.log`):
232018606 bytes, SHA-256
`2ac27037d81a8179a138fbcd78558d8237c684f8843122d85e4f56eaa073be6d`.
Source SHA-256: `30d4578fed5aec88e658fda1b9bc7c42c37b0a0b1f4aba1f4d32e69c7194be90`.
The packaged integration/reopen check also passed:
`build/blockwalker-playground-integration4.log` exited 0. Continue longer trials
with other random seeds and gameplay polish through the requested deadline;
the main task remains open.

A second random seed (offset 42) contradicted the longer patrol's stability:
Sidelight fell at 648.75 s after two save/reloads, with zero external character
contacts. The trace showed a reversal advancing the already leading foot until
the stance exceeded the gait's reach. Replaying the saved 600-second world
reproduced the fall at the same time. Changing only the controller to transfer
weight onto that foot and swing the trailing foot kept all 33 objects alive to
900 s, with 18 additional qualifying steps, zero aborts, minimum up 0.98467 and
six replants. Physics, geometry, motor limits and step criteria are unchanged.
Evidence: `build/blockwalker-replant1.log` and
`build/blockwalker-replant-proof/{baseline,replant}-{world.json,trace.csv,roam-memory.jsonl,roam-contacts.csv}`.
The change is in the source catalog; fresh-world and repeated-restart trials
are still in progress. Same-foot steps during a reversal are intentional;
alternation diagnostics must not be misreported as uninterrupted alternation.

The fresh seed-42 world now passed 1800 simulation seconds with a new process
and world reload every 300 seconds: all 33 objects alive, zero removals, 118
qualifying biped steps (59 per foot), zero aborts, minimum up 0.98497, 18.36 m
patrol range, twelve replants and nine traffic yields. There were zero external
biped contacts. Sundial travelled 863.26 m with 21 arrivals/two meetings;
Skybarge travelled 2324.87 m with 89 arrivals/thirteen meetings. The boats
travelled 1587.92 and 1695.92 m with minimum up 0.9978 and 0.9972. These are
distances from one-second physical samples, not claimed progress from the scripts.
Evidence: `build/blockwalker-replant-long1.log` (exit 0), the six saved worlds,
traces, memories, contact records and `result.json` in
`build/blockwalker-replant-long-42/`. The source-only run used
`build/blockwalker-replant-long.mjs 42` and compiled its physics probe in Dolly.

Local preview rebuilt after the gait and proxy-import fixes:
232021463 bytes, SHA-256
`a084b626715df04b82ead199bce093e5226f08d38f7eb4c277cb14efab9d730e`;
source SHA-256 `836a280be968b9019636ee91dd855afc95e8df6448933126e6529aa709b12978`.
Build took 24.5 s with the unchanged runtime (`build/blockwalker-playground-image4.log`,
exit 0). A fresh Chrome visit to the actual 9099 preview verified the packaged
catalog, starter car, driving, Eyes/follow switching and saved player: 159 frames,
34 objects, no browser errors (`build/blockwalker-checkpoint-preview2.log`, exit 0,
screenshots/world in `build/blockwalker-checkpoint-preview/`). The first check
used the wrong saved-field name, `player` instead of `playerId`; correcting the
check resolved it without a game change.

The proxy replacement issue `20260923-203200-codex-04` is closed with a real Pi
connection test against local SSE fixtures; the conversation survives changing
the endpoint. Continue with the open durable-save and library round-trip issues
`20260923-203200-codex-02` / `-03`, and cargo/interaction polish. The playground
goal remains open through the requested deadline.
