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
- Remove the useless bridge from the starting population; add varied characters
  and activity throughout the world, as requested on September 24. Measure the
  resulting population's performance and interactions.

September 24 follow-up to `c3e7416`: the seed-42 run reached 720 s with all 45
objects, then lost the eastern lookout at 749.18 s. Replaying the saved segment
with contact logging identified Postbird's low flight pressing on its head;
steering away from the cliff alone did not fix it. Postbird now raises its
clearance around predicted nearby ground traffic. The same 720–780 s scene
retained all 45; contact ended at 721.42 s, compared with continuing until the
fall in the old controller. Evidence: `build/blockwalker-air-traffic-proof/`
and `build/blockwalker-air-traffic1.log`. No permanent collision exemptions or
pose correction were added.

The full seed-42 trial passed 1800 simulation seconds with nine reloads: all 45
alive, five deliveries, 117 biped steps, zero aborts and zero external biped
contacts. Lookouts travelled 988–2122 m with 28–76 arrivals; the porter delivered
three crates and continued searching, and skiffs travelled 1422–1576 m.
Evidence: `build/blockwalker-air-traffic-long1.log` (exit 0), all ten worlds,
traces/contact records and `result.json` in `build/blockwalker-air-traffic-long-42/`.

Packaged locally in 24.9 s (`build/blockwalker-playground-image8.log`),
232121889 bytes, SHA-256
`9626beb11dd3f669afe845e8a02fd5151d69ab9647f7401bfa07be612dbc6150`;
runtime unchanged. Driving/cargo and focus-view browser checks passed
(`build/blockwalker-air-traffic-driver1.log`, `build/blockwalker-save-focus1.log`).
The short overflight regression crossed 12.172 m at a peak altitude of 8.508 m,
displacing the stationary lookout only 0.0039 m. Courier deliveries still stack
correctly across restart. The actual 9099 preview passed visible Save, refresh,
modal typing/F11, held-key release and failed-save-retention checks. The live
learned session and recovery archive were not modified.

The complete learned history now survives a normal live Save followed by closing
and reopening the copied session: all archived hashes preserved except pausing
Pi, all 51 creatures retained, 3.08 GiB peak under the 4 GiB/no-swap test limit.
Immediate same-tab refresh still fails at replacement runtime boot; details and
proofs remain in the open `20260923-200000-codex-01` memory issue. The original
named saves and recovery archive remain untouched.

An additional seed-7 trial passed 1080 simulation seconds and five reloads:
all 45 alive, five deliveries, 45 qualifying biped steps, no aborts or external
biped contacts. Lookouts travelled 545–1261 m; skiffs 861–927 m. Evidence:
`build/blockwalker-air-traffic-seed7.log` (exit 0) and
`build/blockwalker-air-traffic-long-7/result.json`. Inspection beyond survival
found Northline stalling while lowering a tilted crate in both seeds; follow
`20260924-030000-codex-01` for the now-verified physical-feedback fix. The held
crate's real support force replaces a fixed-height release condition. A replay
of the stuck world resumed in 0.417 s and completed nine set-downs in 120 s;
the fresh regression completed 40 in 600 s across a restart. All original world
objects survived the replay.

Previous package: 232123849 bytes, SHA-256
`428c9b2e84af3213bd10df32616684d5409f6792214babe4a8b592c0b6dd2160`;
source SHA-256 `ed6a354d9e8a70269692b355005e28c8d4f153f1e87646a0d0aacf0b475586a7`.
The runtime is unchanged, build time 23.6 s
(`build/blockwalker-playground-image10.log`). Driving/physics and packaged
embedded/restore checks passed in `build/blockwalker-gantry-driver2.log` and
`build/blockwalker-gantry-integration2.log`. The 9099 metadata matches the built
image. The learned world and its history remain untouched.

The catalog now has 49 objects / 1191 parts / 30 designs. Tsubame is a small
19-part harbor tug with differential jets, Eyes and a bow magnet. It finds
floating cargo, tows it to Harbor Atlas, releases it within the crane's reach
and backs away for the handoff. Three new floating crates provide real jobs.
An isolated 600 s trial delivered all three (90.917, 251.017 and 418.017 s);
the tug travelled 346.89 m with minimum up 0.98981. In the full population,
600 s and three reloads retained all 49 objects, with seven total deliveries
and two tug-to-crane handoffs. Twinspire carried the third crate farther out
by contact; it remains afloat beyond the tug's current search area.
Evidence: `build/blockwalker-tug-{4,full-42}/` and matching logs. The pier-water
bug exposed by this work is fixed in `20260924-035500-codex-01`.

Previous package: 232133388 bytes, SHA-256
`43d624adadf24b7752d360e6c9ab02df210f55f778ab4b7bc0a0c1061db9ede4`;
source SHA-256 `1cfab38eb64673f14b6ebb57c6cbe76f73740fb8c545859a5b2af76ca18b7196`.
The runtime is unchanged; rebuilding took 23.4 s
(`build/blockwalker-playground-image11.log`). Source driving/physics checks
passed in `build/blockwalker-tug-driver1.log`, including a loaded tug restart,
actual crane takeover and credited delivery at 91.417 s.
The packaged population/embedded/restore check passed in
`build/blockwalker-tug-integration1.log`. A fresh visit to the actual 9099 preview
confirmed all catalog controllers, driving, Eyes/follow and zero browser errors
(`build/blockwalker-tug-preview1.log`). Six five-second view samples measured
50.57–52.35 FPS on this machine; these are local samples, not a cross-device
performance claim. Screenshots and the 50-object world (including the player)
are in `build/blockwalker-tug-preview/`.

All 34 characters now have Eyes, converted from existing ordinary blocks with
unchanged geometry and material. The population remains 49 objects / 1191 parts.
Click a character and press Backslash to watch from its physical Eyes while its
program keeps running; WASD leaves the view. The packaged Chrome check measured
13 body-relative camera samples across Sidelight, Komame and Tsubame, verified
continuing simulation and movement, and exercised switching and no-Eyes fallback.
Evidence: `build/blockwalker-spectator-packaged1.log` and
`build/blockwalker-spectator/`. Driving/physics regression also passed:
10.677 m of keyboard driving, 74 Eyes samples and actual pickup, plus the
existing physical scoring, turntable, restart, water and crane checks
(`build/blockwalker-spectator-driver1.log`).

Twinspire's avoidance now includes loose cargo. In a fresh seed-42 run, all 49
objects survived 600 simulation seconds and three reloads, with eight deliveries
and all three tug-to-crane handoffs. The tug travelled 328.14 m with minimum up
0.98981. Merely widening the tug's search rectangle did not recover a crate being
pushed away by Twinspire, so that prototype was discarded. Evidence:
`build/blockwalker-tug-cargo-avoidance-42/` and matching log. Distances are measured
from physical poses, not controller counters.

Previous local package: 232135241 bytes, SHA-256
`5684ed4bcd2303127143c7280bc6a523bf5a2cc9727b656da58bb61c6073d31c`;
source SHA-256 `50cd82151643ef0bfcf01ca535c5b335ce681db92db103a95118e0e2be378ccc`.
Build time was 23.5 s with the unchanged runtime
(`build/blockwalker-playground-image12.log`). Actual 9099 preview verification
passed controller/catalog comparison, driving and six world views, with no
browser errors. Five-second view samples measured 50.15–55.77 FPS on this machine
(`build/blockwalker-spectator-preview1.log`); no cross-device performance claim.
The original learned session remains untouched.

The same catalog passed another 600 s with route seed 7 and three reloads:
49 objects, zero removals, eight deliveries and all three tug handoffs. The
harbor deliveries finished at 205.45, 367.28 and 534.38 s, in a different cargo
order. Evidence: `build/blockwalker-tug-cargo-avoidance-7/` and matching log.
The anchored shuttles are also active: seed-42 Lattice completed 35 cycles with
zero faults, and Dockhand continued its pickup/transfer/release cycle through
the final minute. Their stationary roots do not imply stalled programs.

The sidebar and existing focus HUD line now report magnet power and actual
carried cargo. A player delivery confirms the depot and updated total. A manual
Chrome playtest used only the normal C/E/W/Q controls in the full population:
crate 51 was picked up, driven to the Works yard, released and credited once.
Picking it up again did not add credit. Screenshots show off/on/loaded states,
the focus HUD, green delivered cargo and the confirmation. Evidence:
`build/blockwalker-playtest/{result.json,ui-*.png}` and exported worlds.
The porter also recovered after the player cleared its approach, delivering
its waiting crate at 101.03 s in the saved-scene replay
(`build/blockwalker-porter-player-depot.log`).

Current local package: 232138066 bytes, SHA-256
`f3208ed47099347f619fe0c445da30a7e90c31cad17620f4136d1e25cba11ea4`;
source SHA-256 `29fc0bd1a7bb8d22ebf65ac73135175243540ab73c94ca022e9eb95625233b61`.
The unchanged-runtime build took 23.1 s (`build/blockwalker-playground-image13.log`).
A fresh actual-9099 visit repeated the delivery with ordinary browser controls,
credited the player once and retained all 51 objects including the car and test
crate (`build/blockwalker-cargo-ui-packaged.log`, exit 0).

Leaving the car parked near the depot also recovers without controller changes:
the exact 130.88 s playtest world resumed for 180 s, retained all 51 objects and
let Mochi deliver its remaining two crates at 142.55 and 281.85 s. It then resumed
searching. Evidence: `build/blockwalker-porter-occupied-baseline.log` and the saved
world, physical trace and controller memories in
`build/blockwalker-porter-occupied-baseline/`. Crowding delayed the jobs but did
not leave the porter circling indefinitely; no speculative replanning fix was added.

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

Library/design/world import is now verified and packaged (issue `-03` closed):
232062718 bytes, SHA-256
`1e51db003869043ea3f9ff37dc3204b7106dac432fc0af1d011d4aad78d90cf9`;
source SHA-256 `05f4c6da1154a9bfd34d9eee76655d90ad101b57bdd69d395c900c7fe58450f4`.
`build/blockwalker-import-integration2.log` passed the packaged population and
embedded integration/reopen checks. The first test sampled only 18.73 simulation
seconds in 30 wall seconds and missed the courier's initial lift. Sampling now
runs to 35 simulation seconds and compares against its recorded pickup height.
Actual pickup was y=4.646, first sampled cargo y=6.356, peak y=7.015; no physics
change was needed. The next content pass prototypes small roaming characters
and retires Tidegate while retaining demanding walkers and working machinery.

2026-09-24 population reconciliation:

The starting world now has 45 objects / 1169 parts from 29 designs. Tidegate is
in the optional archive. Five 12-part Komame lookouts roam the yard and islands
with physical turning Eyes heads. Mochi uses a piston and magnet to lift crates,
deliver them to the Works yard and search for more. Three 17-part Minamo skiffs
fill quieter coastlines; Threewake and Twinspire now choose water routes rather
than repeat the former bridge approaches. Harbor Atlas has a lighter, longer
magnetic head and actually salvages a floating crate into the Harbor depot.

The first lookout trial hit a northern shed post and tipped over. Controllers
now receive nearby terrain bounds from the in-Wasm geometry, so posts and roofs
can be considered alongside sparse ground samples. The eastern lookout also
needed reachable destinations in the open area below the landing shelf. These
are ordinary userspace sensors; the browser ABI and authority are unchanged.

`build/blockwalker-neighbors6.log` passed 540 simulation seconds with reloads
every 180 seconds: all 45 alive, five credited deliveries, biped 35 qualifying
steps / zero aborts / zero external character contacts. Lookouts travelled
268–621 m with 7–21 arrivals each; the porter delivered three crates and resumed
searching. The small skiffs travelled 385–478 m. Traces, saved worlds and
`result.json` are in `build/blockwalker-neighbors6-42/`. The boats were renamed
from the prototype label Mizumushi to Minamo after this run.

The packaged check caught Westwatch selecting the closer new rover beyond its
joint range. It now chooses reachable targets with hysteresis. The check follows
its current target after acquisition, rather than the first historic target.
`build/blockwalker-neighbors-integration2.log` passed the complete packaged
population, physics and restore checks. `build/blockwalker-neighbors-driver1.log`
passed driving (11.18 m), 74 Eyes samples, actual pickup/release, the tilted
turntable, persistent cargo scoring, courier stacking and resumed sensors.

Current local package: 232121639 bytes, SHA-256
`bb20c84838a4cbe510301a3f456abf65e7bb6d9aaa022bf1b22dc4844109d913`;
source SHA-256 `96fb4b5211401aa1e9f4d3d352ecfcac54bc6a66a771f89143158c2998c7cd37`.
The runtime is unchanged; rebuilding took 32.1 s
(`build/blockwalker-playground-image7.log`). Longer population trials and the
remaining durable-save workflow are still pending under the active goal.

The actual 9099 preview passed a fresh Chrome visit, catalog/source comparison,
driving and six world views (`build/blockwalker-neighbors-preview1.log`, exit 0).
Five-second samples on this NVIDIA browser measured 52.18 FPS in the yard,
39.14 harbor, 39.77 east, 35.77 west, 32.96 north and 33.76 overview. These are
local measurements, not a cross-device performance claim. No browser errors;
46 objects including the test player's car. Screenshots, saved world and the
measurements are in `build/blockwalker-neighbors-preview/`. The learned session
and its Pi conversation remain untouched; no model requests were made.

The current served population has 49 objects / 1191 parts and 30 designs,
including the harbor tug and floating cargo. All 34 characters have a working
Eyes view; the player HUD reports magnet/pickup state and confirms deliveries.
The corrected Skybarge controller passed the original quarry failure replay,
an isolated crossing and a fresh 1200 s population with six reloads, all 49
objects and eight deliveries. The actual 9099 follow/Eyes check passed.
Current package SHA-256:
`742a7d247d68e8db626045f0f573f54ad46fdd319d42834a01ff3c886127f9b1`.
Marrowstep also now replants after a blocked gait phase. Both failure replays,
a short physical regression and a fresh 1200 s population passed, including
398 supported airborne foot placements in the final five minutes. The actual
9099 follow/Eyes check and packaged driving/pickup suite passed. See
`20260924-051500-codex-01` and `20260924-054500-codex-01` for the controller
evidence and current package details.
