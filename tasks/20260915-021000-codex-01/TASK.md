# Explain why a programmed creature is removed

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: game,diagnostics,agent

The two original tripod walkers disappeared after over an hour. Current logs
only say CREATURE removed and its age. world_step uses that same path for an
invalid/timed-out controller and for persistent bad posture or sinking, so the
available record cannot prove that either walker physically fell.

Record the actual removal reason, controller error when available, age and
last physical state in ordinary saved game data. Let Pi inspect recent failures
without needing terminal output or a host backup. Keep the saved design and
controller available through the library. Verify a deliberately failing program
and a physical toppler produce distinguishable records that survive restart.

Do not change the controller deadline or survival conditions based only on a
hypothesis. Use the recorded evidence to diagnose later failures first.

## Verification, 2026-09-15 02:34 JST

World saves now retain removal records containing creature ID/name, world time,
lifetime, cause, error detail, position and uprightness. Observations include the
latest eight records. Controller failure, sustained bad posture, sinking,
nonfinite coordinates and falling below terrain are distinct causes. Existing
controller budgets and survival conditions are unchanged. Old removals remain
unknown; the UI says removed instead of assuming every disappearance was a fall.

The C image compiled inside Dolly. The focused Chrome integration passed under
a 4 GiB/no-swap scope: an infinite-loop controller and a physically collapsing
four-block body produced distinct records, and a complete game restart retained
the records exactly. Their designs/controllers also remained in the library.
Existing magnet pickup/lift/release and restored cargo attachment, boat buoyancy,
anchored bridge and feedback flight checks passed.

Evidence: `build/slopyard-diagnostics-integration.log`,
`build/slopyard-proof/slopyard-integration.json` and the `removals` array in
`build/slopyard-proof/slopyard-world.json`.
