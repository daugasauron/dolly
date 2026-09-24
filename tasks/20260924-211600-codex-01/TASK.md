# Extend physical cargo competition through the morning

- STATUS: OPEN
- PRIORITY: 250
- TAGS: game,content,physics

User goal: continue from September 24, 21:01 JST through September 25, 07:00 JST.
Retain collected cargo, add physical handoffs and terrain, distinguish red/blue
teams, and experiment with saboteurs and defenders that tip opposing machines.
Fallen machines must remain visible and have an opportunity to recover.

Every behavior belongs in a visible ordinary character program, using shared
physics observations and actuator keys/radio. No C steering, posture correction,
teleports or special launch impulses. Preserve the original world and complete
Pi history. Work on the game branch, compile C inside Dolly and run one owned
4 GiB/no-swap browser tree at a time. Update only the owned 9099 preview at a
tested checkpoint; do not push or deploy.

The original runtime removed scored supplies after 45 seconds and tipped/sunk
machines after two seconds. Source now retains them, including across saves.
The lifecycle fixture physically regrips a retained scored crate and lets an
upside-down machine recover through its program after more than 100 seconds.
The current one-way-jet repeat passes in world and practice modes:
`build/blockwalker-retention-one-way-recovery/`.

The lifter and guard prototypes use ordinary wheels, pistons and magnets.
A 120 s defensive trial overturns a real raider; defense is imperfect because
the scout falls first. A saved continuation physically rights the friendly scout.
The 600 s populated trial retains all 76 starting objects, makes 15 deliveries,
and repeatedly tips/rights both raiders without controller errors. Evidence:
`build/blockwalker-rivalry-defense-intercept/`,
`build/blockwalker-forklift-rescue/`, and
`build/blockwalker-rivalry-mainland-first/`. Successful physical interaction is
proven; reliable strategic disruption of deliveries is not.

Solid quarry terraces and a drivable service road are in `249bcd2`. Remaining
checkpoint work is tracked separately:

- [Warehouse storage](../20260924-220500-codex-01/TASK.md): repeat both teams' heavy handoffs.
- [Quarry runner](../20260925-012600-codex-01/TASK.md): physical runner/courier relay.
- [Firefox performance](../20260925-010000-codex-01/TASK.md): verify the final crowded population.
- [Cargo slinger](../20260925-032000-codex-01/TASK.md): reload and fire real light crates.
- [One-way thrusters](../20260925-035000-codex-01/TASK.md): preserve old builds and transport behavior.
- [Rope/winch](../20260925-041500-codex-01/TASK.md): optional follow-up, not required by the first slinger.

Lua/YAML remains a separate issue. Candidate content under `build/` is not the
packaged catalog until its combined-world and browser checks pass.

The user subsequently requested a stable checkpoint and local launch. Further
feature experiments are stopped. Packaging and launch are tracked in
[the September 25 checkpoint](../20260925-064800-codex-01/TASK.md). The catalog
has 91 placements; the populated recovery reaches 125 retained objects and
37 deliveries. Fresh uninterrupted freight verification and crowded Firefox
performance remain open, rather than being claimed complete at the cutoff.
