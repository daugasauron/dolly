# Place loose cargo on boats and elevated world mechanisms

- STATUS: OPEN
- PRIORITY: 250
- TAGS: game,physics,agent

Tidelock's loaded lift works in practice, but the shared-world cargo tool only
spawns at the terrain/water surface. Its y argument is currently practice-only;
the world branch validates it but does not pass it to world_drop_cargo. This
prevents reproducing that loaded-platform experiment in the shared world using
the same placement coordinates. Quayfin currently only passes beside the pier.

Allow an explicit initial y for new world cargo and optional height for bundled
cargo placements. Preserve the current automatic surface placement when omitted.
Keep ordinary gravity, collisions and controller forces after creation; do not
move existing cargo to fake a transfer. Save/restore must preserve the resulting
physical state. Reject invalid coordinates without creating a body.

Verify a crate settles onto a real boat or raised lift, survives a complete
loaded motion cycle, and reloads correctly. Keep original ground-level magnet
pickup working. The existing root_height field describes the design's standing
height for removal checks; an elevated drop must not make a one-block crate look
like a tall torso that collapsed when it reaches the floor. Then let Pi test
actual loading/transfer, keeping that outcome separate from mere proximity.
