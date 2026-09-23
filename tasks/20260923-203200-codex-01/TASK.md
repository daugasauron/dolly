# Restore controller sensor and actuator state before the first resumed tick

- STATUS: OPEN
- PRIORITY: 300
- TAGS: audit,game,physics,persistence

Audited checkpoint aa28100. `world_load` restores poses, velocities and controller
memory, but `physics_attach` zeros cached part angles/rates and controls. The
controller runs before the next `physics_sample`, so a 60 Hz feedback controller
receives false joint readings immediately after reload. Cached commands between
slower controller updates also need review; that case is source-inspected only.

Browser reproduction: spawn an anchored two-part vertical hinge with Y axis,
Q/A bindings and a 60 Hz controller recording `s.angles[1]`/`s.rates[1]` in memory
and returning `{A:.6}`. Save after 1.2 s, restart the game, and record the first
controller calls. The last pre-save angle was 1.310963273 rad; the first resumed
call at t=1.2 read 0; at t=1.216667 it read 1.310963273 again. Source was unchanged.
This reproduces invalid feedback, not a demonstrated biped fall caused by it.

Evidence: `build/blockwalker-audit-20260923/sensor-continuity.json`, before/after
world JSON and `build/blockwalker-audit-{seed,resume,browser}.mjs` (23214 exit 0).
Relevant code: `physics_attach`, `world_step` and `world_load`.

Restore/reconstruct required sensor and motor state before controllers resume,
including a deliberate policy for contacts unavailable before a solver step.
Extend the existing reopen regression to observe the first controller inputs and
commands at 60 Hz and a slower frequency. JSON equality alone does not cover
this: the current fixture compares only fields already present in the save.
