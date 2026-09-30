# Prevent couriers from supporting and trapping each other in flight

- STATUS: CLOSED
- PRIORITY: 290
- TAGS: game,physics,controllers,bug

In `build/action-front-20260927/full-v5/checkpoint-0600.lua`, courier135's
unpowered magnet housing rests on courier136's wing. Both remain upright with
magnets off, so the existing overturn recovery does not run. The upper craft
tries to descend to cruise altitude while the lower craft tries to climb there;
their resulting forces balance through contact. Return/depart cannot complete.
The traffic scan currently considers ground-level obstacles only.

Measured at600s: oriented-box gap−0.0000965m between parts10/16; remaining
forces are approximately(2.739,−8.402,6.677)N and(−2.746,8.400,−6.678)N.
Both phases remain unchanged through720s. Replay the exact saved poses and
controller memory, changing only the two embedded courier programs.

Add generic airborne clearance using observed geometry: the higher craft climbs
above its neighbor's full height plus its own hanging footprint; deterministic
ID ordering resolves near-equal heights. Retain cargo magnets, mission state,
ordinary thrust limits, ground/roof clearance, and every existing actor.

Acceptance: the saved stack separates physically and both missions resume;
fresh scout-dispatched couriers cross without contact, including a loaded
crossing with actual cargo retained. Run inside Dolly; no host C compilation,
teleporting, forced attachment, or actor-specific production rules. Candidate
and focused probes are in `build/action-front-20260927/air-traffic/`.

Implemented in `programs/east-air-courier.lua`; frozen source SHA-256
`92ae409f5236942df6cc910cf5c216cd93f523edbc7dc6b78ff3ff331d0c4edf`.
The observed higher craft gains clearance with ordinary thrust; equal-height
priority uses observed IDs. Actual own bounds account for hanging parts/cargo.
The controller keeps mission, magnet command, roof/ground logic and force limits.
Practice mode skips world self-observation when its actor ID is zero.

Focused browser/Dolly proofs pass under
`build/action-front-20260927/air-traffic/`:

- `recovery-v1`: exact 600 s world, only two embedded sources replaced. Contact
  ends around 602.1 s; both missions resume by 602.5 s. Sustained separation is
  confirmed at 610.367 s; all 156 actors remain, no faults/deaths.
- `crossing-v3`: ordinary scout jobs make two couriers cross outbound and again
  carrying actual cargo. No courier contacts over 121.600 s; both parcels stay
  attached during loaded yielding; no errors/deaths.
- `regression-v1`: retained standalone
  `test/fixtures/slopyard-air-traffic.c` compiles inside Dolly and passes the
  same natural crossing without a captured-world dependency.

Inputs, traces, output worlds and browser proofs are retained beside `RESULT.md`.
Final integrated verification: `build/action-front-20260927/full-v6` continues
the actual 600 s population for another 600 s with all six courier sources
updated. Courier 135 completes two island deliveries; 136 completes one and
carries its next parcel. All 156 starting objects remain, with no controller
faults/removals. The packaged image passes actual Firefox/Chrome checks and
old-world restoration; sources match the served archive.
