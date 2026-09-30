# Organize combat around opposing teams and contested cargo

- STATUS: CLOSED
- PRIORITY: 280
- TAGS: game,combat,teams

Keep island bases outside artillery engagements. Target opposing active airborne
characters inside the combat rectangle, prioritizing cargo carriers and fresh
teammate threat reports. Prevent release through friendly/neutral bodies or
terrain. Coordinate actual cargo collection, staging and island delivery through
ordinary editable Lua, physical actuators and team radio.

The previous guns excluded teammates as selected targets but only checked their
spinning-arm clearance. They had arbitrary target order and no engagement zone
or projectile-path safety check. Both now use combat bounds, carrier/threat
priority, swept ballistic checks, and actuator-based launcher/loader pairing.
Loaders discover payload collision bounds, support raised-deck pickup, release
wrong grips and recover failed handoffs. Guns back off 8 seconds after missed
pickup, or 90 seconds after every third failure, before requesting redocking.

Scouts and couriers accept all undelivered neutral cargo inside combat, including
starter parcels and intermediate depot stock (`supply=0`). They exclude team
ammunition, held cargo and programmable payloads actively gripping another body.
Scouts inspect at the radio cadence; couriers honor fresh claims. Failed jobs
now re-seek at the courier's current position rather than returning empty to base.

Reproduce the focused checks with
`xvfb-run -a node test/slopyard-controller-browser.mjs test/fixtures/slopyard-team-strategy.c`.
The runner builds current source with the image compiler inside Dolly.

Evidence in `build/combat-20260927/`:

- `targeting-v6/terminal.log`: all ten physical checks pass against source-v13.
  Both guns pass team/cargo/grounded/combat-boundary exclusion, loaded-carrier
  priority, friendly trajectory hold/release, actuator discovery and physical
  reload. A payload 1.4 m off-center with a fresh handoff report reaches the
  Tengu/Hosen guns at 112.317/79.867 s. The same offset with a missing report
  reaches Tengu at 83.617 s. These cases reproduce the populated world's
  annulus deadlock: the old gun rejected handoffs beyond 1 m but also refused
  to request stock inside 3 m. Pickup still requires actual magnet proximity.
  Neutral logistics accepts starter cargo, excludes team ammunition and active
  magnetic payloads, and re-seeks in place after an unavailable job.
- `full-v11`: 900 simulated seconds, 103 total objects, all 87 originals retained,
  no faults/deaths, eight island deliveries and scores 3/12. This run includes
  in-place courier re-seeking and the compact projectile's actual enemy catch,
  ground-tug pickup and return. Its off-center reload deadlock led to the
  focused fixes verified above; it predates those final reload changes.
- `full-v9`: 900 simulated seconds, all 87 originals retained, 101 total objects,
  no faults/deaths, seven deliveries and scores 10/11. Five light loads arrive
  by courier. Ore 88 follows hauler → quay crane → East barge → receiving crane
  → forklift → island (8 points at 845.483 s). Ore 91 follows the corresponding
  West chain (8 points at 850.017 s). Couriers make 6/7 dispatches, Suzume 279
  reports, the carousel 3 handoffs, and the porter 9 staging trips.

Trajectory checks predict current velocities
within observation range; they do not guarantee that unseen or later-maneuvering
units cannot cross a shot. Weapon loaders exclude spawned supplies but still
accept neutral unspawned light cargo as ammunition.

Closed after actual 9097 Firefox/Chrome checks: all 87 programs/blueprints match,
terrain 6, no errors/readbacks, clean exit. Firefox restores new terrain-6 and
old terrain-5 worlds with programs/attachments intact and >16 s continued play.
Evidence: `build/combat-20260927/{local-preview-firefox,local-preview-chrome,checkpoint-restore,noon-restore}`.
`package-proof.json` and `preservation.log` verify 69 source files, six protected
saves and 56 unchanged unrelated assets. Projectile reuse remains separately open.
