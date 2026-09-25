# Blockwalker handoff

Work only in `/home/daug/dev/dolly/work/gpu-shaders`, branch
`codex/blockwalker-playground-20260923`. Do not modify the parent worktree or
other previews. The active goal continues current issues and a more lively
world through September 25, 21:00 JST. No push or deployment is authorized.

Image 33 is served at `http://127.0.0.1:9099/blockwalker/` by user service
`dolly-blockwalker-preview-20260924.service`; owned relay 9010. The image built
inside Dolly in 42.4 s, retaining all twelve other images. It has 93 designs,
rigid compound assemblies, the SIMD Box3D library and six revised freight
machines. Source SHA-256:
`107a7af7418dac72c2ceafb4bf557cf5f50991b725a6db850495183f70925e03`.
The snapshot is 234545952 bytes, SHA-256
`a47ac5685eb091ab3a55c47519b0c67c58bdd1f8f26b3f57bf8e874477663cd6`.
Chrome and Firefox both verify all 93 catalog entries and restore the older
125-object world with zero browser/model errors (`build/blockwalker-image33-
preview{,-firefox}/proof.json`). Bearing physics and builder controls pass.
Cargo lifts/boats and reload pass (`build/blockwalker-image32-cargo-verified.log`).
The full driver/playground physics passed, but image 32's later restart exposed
quaternion roundoff accumulating across reloads. Image 33 fixes this by
normalizing restored and relative rotations and using identity owner frames.
The exact formerly failing 97-object save now survives twenty reopen cycles
and ten simulated seconds; the bearing fixture passes twenty reopens too.
Evidence: `build/blockwalker-compound-regressions-chrome-restore-normalized/`
and `...-bearings-normalized/`. The packaged program-editing/restart workflow
passes: original W no longer drives, imported I moves 4.54 m, invalid source
preserves the installed program. `build/blockwalker-image33-driver/`.
No owned disposable browser is running. The checkpoint commit is named
`Use rigid block assemblies and restore the freight chain`.

The final Firefox view starts with 127 objects and retains 129 at the end.
It measures 48.15 FPS after 30 s warmup over three 20 s scenes, with simulation
near real time and zero errors. Screenshots of both yards and the quay are
reviewed: `build/blockwalker-rivalry-view-firefox-crowded-image33-freight/`.
Compound and crowded-performance tasks are closed; West recovery and late
warehouse routing remain open. The latter save is a useful continuation: both
handlers still carry their third load, East near (167,44) and West trying other
storage sites. Freight itself is past the prior four-load jam and loading its
seventh pallet; its task is closed.

All behavior remains ordinary editable programs using common sensors, actuator
keys and radio. No actor-specific motion helpers, teleports, deleted cargo or
weakened loads. Physics remains 60 Hz. Experimental cadence changes, lazy
observations and sleep are excluded. Existing saved worlds retain their own
programs and blueprints; opening an old save does not replace its catalog.

The latest populated 2400 s trial passes: 127 retained objects, 35 deliveries,
six complete heavy freight chains and two heavy loads physically stored per
island. Both third loads are still with handlers at the cutoff; the quay is
loading the seventh. Zero controller errors, crew contacts or truck rollovers.
Evidence: `build/blockwalker-rivalry-compound-freight-populated42/`, especially
`report.json`, `freight-proof.json` and `recovery-proof.json`. Exec 9466 ended.
Its source archive `compound/checkpoint-source.tar` has SHA
`2d29aac72d4927b5603b03c76eeb8b0b1facaafb197034908c84cd803f6d85f5`;
`compound/freight-catalog.json` is now the canonical 93-entry catalog. Later engine changes guard the absent fresh-world version lookup and normalize
restored rotations; fresh initial poses are identity and unchanged.

The freight changes are catalog rows 52..57 (zero based): tandem-mast six-wheel
hauler with physical support feedback, shorter quay boom, taller receiving
cranes and more stable barge steering/ballast. Three existing bottom hull blocks
per barge become ballast; no extra shapes or reduced cargo mass. Lift and
warehouse programs are unchanged. The isolated 2400 s chain also passes with
six heavy deliveries and two stored per island:
`build/blockwalker-rivalry-compound-reachable-freight/`. Original machines under
the same engine store none: `...compound-original-freight/`. A hauler waiting
near z=98 can be correctly waiting for the occupied quay; inspect before
calling it a steering failure. Freight is verified and closed; warehouse routing remains open beyond the
first two successful loads per island.

Turntables support 1x1, 2x2, 3x3 and 4x4 footprints, mounting on multiple blocks
across both faces. Both slingers use two 3x3 bearings, open-frame masts,
exposed rotors, counterweights and retracting loading pedestals. Their compact
loaders start 16 m away; two 14-part trucks recover light ammunition. The broad
bearing request is committed in `56f29b7`; recovery crews in `108b25d`.
The final compound isolated 600 s interrupted test has four recoveries, three
complete truck/loader/slinger chains and shots, one confirmed aircraft hit,
loaded save/reopen and manual magnet-off recovery, without crew contacts.
`build/blockwalker-launcher-compound-interrupted/`.

Recovery task `20260925-083000` is REOPENED: in the populated compound trial,
East completes three restocking chains and six shots; West fires its initial
three crates but retrieves none. West's truck stays upright and keeps evading
enemies or abandoning routes. Inspect accessible ammo, route failures and
placement. Do not invent ammunition or weaken guards. The pre-compound SIMD
900 s run did demonstrate both-team restocking and was byte-identical to scalar:
`build/blockwalker-rivalry-restock-simd42/` versus `restock-evade42/`.

Compound physics task `20260925-100000` is closed with bundled evidence.
Fixed neighboring blocks become shapes on one rigid body, retaining separate
actuator bodies, every shape/material and broad stationary bearing plates.
Forces, buoyancy, contacts and sensors use block-local frames; owner loops avoid
double counting. Connected articulated assemblies retain self-collision except
at the original parent/actuator pair. World format 4 stores block-origin
velocities and block-local magnetic anchors. Version 1..3 loads back up the
original JSON to `blockwalker-world.before-physics-001.json` before conversion.

Preservation/mechanics evidence:
- `build/blockwalker-compound-{chrome,firefox}-mechanics/`: 125-object legacy
  world (2327 blocks) becomes 383 bodies. IDs, programs, memory, blueprints and
  six attachments survive backup/import/save/reopen. Maximum initial position
  error 0.000002861 m, reopen 0.000010491 m; magnet points within 0.000000084 m.
  All bearing sizes/axes, reversed mounts, stationary-side controls, real
  self-contact, momentum, off-center thrusters and floating raft pass.
- `build/blockwalker-compound-paired-firefox-simd/`: 1800-tick CPU baseline
  26.288/26.274 s versus compound 19.282/19.144 s, about 27% less time.
- `build/blockwalker-compound-render-firefox-simd/`: same-browser rendered
  baseline/candidate/baseline 29.77 / 52.15 / 30.77 warm FPS on 125 objects,
  30 s warmup and three 20 s views, near-real-time simulation, no errors.
  These are prototype comparisons; packaged image 33 also measures 48.15 FPS
  on the newer freight world, as recorded above.
- `build/blockwalker-rivalry-compound-recovery42/`: fresh 900 s unchanged
  catalog, 110 retained/17 deliveries; six walkers stay upright and moving.
  West completes no restock in this run either.

Northline's program now lowers until support rather than a fixed extension
(33 supported set-downs/600 s). Harbor Atlas uses its existing luff hinge to
clear the quay before swinging and lowers to measured support (tug/loaded-
restart/crane handoff in 91.33 s). These are the only other catalog changes.
Pilot and lifecycle fixtures pass; all playground subsets pass under
`build/blockwalker-compound-regressions-chrome-{gantry-feedback,harbor-clearance,
remaining,airgrip}/`. Canonical fixtures now use per-shape support and a hinged
wrong-grip obstruction, because rigid anchored assemblies are actually static.
The complete adapted canonical pilot/lifecycle/playground checks pass in
`build/blockwalker-driver/cargo-physics.log`; the packaged image 33 driving,
pickup, editing and restart workflow passes separately.

The untested rope/winch physics probe is `build/blockwalker-rope/trial.c`.
No rope game block/UI/save changes exist. Read its README before running it.
A hard upper distance limit permits slack; force-limited tension reels in only
physically gained length. Built-in bidirectional motor cannot be used directly
because it pushes. After other browser work, run via
`BLOCKWALKER_FIXTURE=build/blockwalker-rope/trial.c BLOCKWALKER_TRIAL_LABEL=rope`
and `build/blockwalker-checkpoint-regressions-browser.mjs chrome rope`.
Rope task `20260925-041500`, Lua/YAML migration and walker limitations remain.

Preserve `.cache/blockwalker-browser-20260915`,
`build/blockwalker-recovery-20260923/` and complete native Pi history.
`build/blockwalker-checkpoint-preservation.mjs` verifies six protected files
(392379755 bytes), twelve other images and all thirteen catalog entries.
Image 33 preservation passes: `build/blockwalker-image33-preservation.json`.
Large-session refresh remains separately tracked in `20260923-200000`.
Disk currently has about 6.6 GiB available; do not remove protected evidence.

Compile C inside Dolly. Run one owned disposable browser tree at a time under
`systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0`, with a bounded
`timeout`. Use `DISPLAY=:1` for Firefox and Xvfb for Chrome. Scripts under the
symlinked `build/` directory need Node's `--preserve-symlinks-main`. Upload USTAR
archives. Never request terminal screenshots while the game owns the GPU.
Do not deep-assert large buffers; use `assert.ok(actual.equals(expected))`.
Animated water invalidates whole-frame equality for camera checks.
Use `node scripts/prepare-blockwalker.mjs` and `npm run image -- blockwalker`
to rebuild only this image; restart only the owned preview service.
