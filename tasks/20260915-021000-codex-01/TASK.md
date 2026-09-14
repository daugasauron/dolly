# Explain why a programmed creature is removed

- STATUS: OPEN
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
