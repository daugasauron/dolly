# Restore controller sensor and actuator state before the first resumed tick

- STATUS: CLOSED
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

2026-09-23 implementation now reconstructs angles/rates without advancing time,
restores held commands and the last control step, and holds those commands for
one actual solver step before resuming feedback. That step rebuilds contacts;
`contactsReady` distinguishes unavailable fresh contact data. Controller `dt`
measures elapsed simulation time, including any gap across reload. Legacy saves
without held commands use neutral inputs for that first step.

The expanded C/browser playground check passed all four resumed cases:
10 Hz at steps 72/73 read angles 0.912141 / 0.974631 rad, rate 0.75 rad/s,
dt 0.116667 / 0.100000 s; 60 Hz at steps 72/73 read 0.912141 / 0.924639 rad,
rate 0.75 rad/s, dt 0.033333 s. Held command remained 0.300 before the first
feedback call. Checks also assert no hidden time advance while loading, contact
readiness, restored scheduler state, deck attribution, and absence of the manual
car in the learned library. `build/blockwalker-resume1.log` exited 0;
`build/blockwalker-driver/cargo-physics.log` records the measurements.
The rebuilt image passed the integration/reopen check as well:
`build/blockwalker-playground-integration3.log` exited 0, including exact saved
state comparison, subsequent PID flight and the restored loaded magnet.
Image SHA-256: `6cff6a40ea28bd635208437131542928e7213c6590cc0a537bd7bdc023e62ce9`.
