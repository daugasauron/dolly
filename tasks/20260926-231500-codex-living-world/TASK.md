# Make the team world active, contested and physically interesting

- STATUS: CLOSED
- PRIORITY: 280
- TAGS: game,controllers,terrain,combat

User requested overnight work until **2026-09-27 08:00 JST** (September 26,
23:00 UTC), explicitly confirming the corrected date. Preserve the threaded
checkpoint and prepare a tested local preview on the existing Slopyard branch.
No production deployment is requested. At 07:43 JST the user requested an early
checkpoint. The selected image is frozen and the actual 9097 smoke check passes.
This closes the bounded overnight round; listed gameplay/performance follow-ups
remain open.

Audit stalled characters; improve physical team logistics, roaming opposition,
captures and rescues. Add difficult terrain and effective tether interception.
Use visible generic Lua programs and ordinary blocks/forces. No actor-specific
engine rules, moved bodies or weakened opponents. Preserve 20 Hz controllers,
60 Hz physics/eight substeps and four Box3D workers. Compile C/C++ inside Dolly.

## Final content

The catalog retains all 81 starting objects and adds Shishi, a 36-part tether
interceptor: **82 objects, 42 referenced Lua programs**. The ridge crawler is
withheld after failing the difficult rescue. Earlier saved custom designs still
load. Unused JSON catalogs and the JavaScript driver are removed; legacy Lua
translations and six preserved user/history files remain intact.

- Actual nearby collision-shape observations replace broad machine circles in
  navigation and landing clearance. Queries are read-only and range-limited.
- Channel ammunition passes through tender, shuttle and gun repeatedly. The
  loader checks moving cargo against real rail stroke and magnet reach.
- Guards share a roaming, escort and reachable team-rescue program. They carry
  their empty forks clear of the ground and use observed shape height at pickup.
- Magnetic ownership counts all holders; release/recovery no longer depends on
  actor ordering. Team help/threat reports carry validated observed targets.
- Shishi's ordinary thrusters, magnets and winch physically catch aircraft,
  reel them down, release and rearm. Couriers retain their own controllers.
- Couriers search after stale reports, avoid busy landing machinery and leave
  covered passages before climbing. Independent ground recovery remains open.
- Mine porter, sump crane, warehouse restacking and stuck transporters resume
  useful work. The quarry has 48 steps and an 8 m landing; East quay has a working
  apron. Quarry/Channel cameras expose the machinery; Focus retains the FPS badge.

## Reproductions and verification

Evidence root: `build/living-world-20260926/`. Each physical trial retains its
inputs, outputs, traces and runner. The earlier chronological experiment record
is retained in `task-before-final.md` there. Important accepted results:

| Trial | Measured result |
| --- | --- |
| `fresh-baseline`, `mature-baseline` | Original 81-object world, 1,200 s combined; reproduce permanent biped retry stops, cargo/traffic stalls and idle dispatch. |
| `channel-edge` | Real 1,800 s stall replay: gun/shuttle 3→6 shots/jobs; outside parcel and recovered starter physically transfer and fire. |
| `combined-fresh-v2` | Fresh 1,800 s: seven channel shots, three outside rounds through 81→77→76 and repeat firing of recovered round 88; no faults/deaths/lost originals. |
| `mine-salvage-bays` | Cargo 42 passes sump crane 41→porter 34→dispatch court at 617.983 s; another mined-core handoff follows. |
| `oreki-unwedge` | Real wall jam clears; 167 m travel and handoff 4→5, minimum up .998. |
| `warehouse-final-west`, `fresh-finalists` | Old stacked-load replay stores two more loads; fresh combined run stores two in each warehouse. |
| `mochi-reverse` | Real crane-side jam clears with supported backing; deliveries 3→7 over 600 s, no faults/losses. |
| `team-raised-fork` | Real 662 s guard stall becomes 29.45 m travel over 600 s, longest still 5.43 s, minimum up .967. |
| `team-local-recovery` | 600 s populated continuation: two additional settled rescues and two captures, no faults/deaths. |
| `courier-clearance` | Stalled West courier completes four deliveries over 600 s, minimum up .9796. |
| `tether-matched-on`, `tether-matched-off` | Same 240 s save, 600 s each: active interception reduces courier travel 905.24→149.98 m and new deliveries 1→0; no friendly grips/faults/losses. One matched trial, not general balance. |
| `capture-reload-final` | Actual captured-aircraft state survives ten reopens and subsequent restraint simulation. |
| `multi-magnet-winch-v2` | Two real holders survive reordered actors/reload; independent releases yield 2→1→0, alongside winch and invalid-state regressions. |
| `radio-check` | Team/range/visibility, target validation, rate limits, coalescing, save/reload and rejected imports. |
| `courier-ground-contact` | 25 nearby/74 distant shape queries, six invalid IDs and independent copies verified against Box3D; also measures actual aircraft support contacts. |
| `landing-final` | New stair/landing/apron collision, map 5 save/reload and old terrain versions. |

`long-fresh` completes **7,200 simulation seconds**, with 151 objects, 67 deliveries,
scores 64/120, no controller errors/deaths and all 83 candidate starting actors
retained. West courier: 40 deliveries. Mine porter: 41 handoffs. Warehouses: 5/4
stored loads. Channel: 11 shots with repeated outside supply and reuse of rounds
80, 93 and 59. The run includes the subsequently withheld crawler and predates
the ceiling fix; do not call it a two-hour trial of the final image.

Tower 82 captures courier 31 at 228.183 s and releases at 233.683 s. The courier
falls; guard 46 grips at 2106.033 s and releases at 2109.117 s. It is upright by
2160 s but trapped under the quarry roof. `courier-roof-baseline` reproduces that
stall. Final `courier-roof-departure` leaves the roof and resumes flight in a
300 s physical replay, then encounters the unchanged interceptor again. Two
further captures release; a third persists. No new delivery: keep the broader
recovery issue open.

Final packaged image tests `final-chrome` and `final-firefox` each exercise fresh
and 151-object saved worlds for 60 real seconds at 1280×720, half with panels and
half in Focus. Mean submitted FPS: Chrome 90.32/70.93; Firefox 287.14/195.94.
Every view averages above 60, simulation keeps real time, all controllers remain
20 Hz, no new controller errors/deaths, zero GPU readback bytes, clean shell exit.
Screenshots inspected. These counters measure submitted frames, not monitor
presentations. The mature input preserves the long-run poses/memory and updates
only the two courier programs; its saved prototype remains valid custom content.

`final-endurance` completes the fresh 750 s real-time pass: mean 103.675 submitted
FPS, 751 simulation seconds, 96 objects, 11 deliveries, four channel shots,
Shishi capture count two, no controller faults/deaths/missing originals and clean
shell return. The first 75 s of the subsequent 151-object run drop to 34–55 FPS.
The browser was stopped for the user's checkpoint request; do not call the full
25-minute test passed. Task `20260927-074500-codex-mature-frame-rate` preserves the
reproduction. No final mature assertions or end-state were collected.

`local-preview/proof.json` verifies the actual 9097 service: 82 default objects,
terrain 5, all 82 embedded programs matching canonical source, 20 Hz, no browser
errors, zero readbacks and clean shell exit. Quarry/Channel screenshots retained.
The source/image files remain the already verified package; no late feature edits.

## Deliberately unfinished

- Sustained crowded-world frame rate: `20260927-074500-codex-mature-frame-rate`.
  Short checks exceed 60 FPS; the longer follow-up has lower samples.

- Guard 43's 19 captures are 18 repeated grabs of survey aircraft 4 and one of
  runner 49, not 19 distinct opponents. Several guards end overturned. Keep
  heavy rescue `20260925-205300-codex-01` and balance `20260925-221800-codex-01` open.
- Grounded courier support/torque failure: `20260927-063100-codex-aircraft-recovery`.
  The ground-contact probe disproves a wall-wedge diagnosis for the tilted pose.
- Ridge rescue: `20260927-071800-codex-ridge-rescuer`. A focused 22-part crawler
  rescue succeeds, but later populated states fail. The final 36-part replay
  grips without releasing the enemy; another variant releases but overturns.
  None of these prototypes belongs in the default lineup yet.
- Upright loaded-bay stalls for Tonbi East and Nekote remain in
  `20260927-074100-codex-loaded-bays`; repeated channel reloads do not prove every
  other supply route is healthy.
- Biped retries no longer permanently stop after three attempts. Looser restart
  causes falls and is rejected; sustained gait remains `20260915-110000-codex-01`.
- Older combined Lua harness reconciliation remains `20260923-211500-codex-01`;
  do not claim the entire historical suite passes.

## Package and local service

9097 serves the new image. Frozen threaded rollback remains at 9096; preserve
9098/9099 and relay 9010. Refresh and start a fresh world to get new catalog and
terrain; restored worlds retain their embedded programs and map version.

Selected image build: 45.3 s with cached dependencies. `package-proof.json`
verifies all 66 canonical source files, actual 9097 served hashes, six preserved
user files and the other catalog entries. `preserve-assets.mjs check` verifies
56 other runtime/image assets unchanged. Snapshot 252,579,916 bytes, SHA256
`d13d57dc03151a5a4fb86321a7c547a18d02d01e6cd99a8a816478c2a409c4f5`.
Source tar 4,179,968 bytes, SHA256
`89dfa57411039c42d129783ba94fc13b9770b971d20931f81b0403ba33b5f0bb`.
Runtime identity unchanged:
`d9dee7375fb5ec91f293a97359d2e2f5a64bbb9a8e4fc7e15c848eb99a995299`.
