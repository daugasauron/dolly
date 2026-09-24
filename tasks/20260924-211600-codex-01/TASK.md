# Extend physical cargo competition through the morning

- STATUS: OPEN
- PRIORITY: 250
- TAGS: game,content,physics

Active user goal created September 24 at 21:01 JST: continue through September
25, 07:00 JST. Retain collected cargo, add more handoffs and terrain, clearly
separate red/blue teams, and experiment with saboteurs and defenders that tip or
otherwise disrupt the opposing machines. Fallen machines should remain visible
and have an opportunity to recover. Keep the world lively and physically real.

The user's additional constraint applies throughout: character behavior belongs
in visible, ordinary embedded programs. No hidden C driving, balance, navigation
or per-character force/pose exceptions. Controllers receive the common input and
physics sensors and return ordinary actuator commands/radio. Keep the same rule
for sabotage, defense, recovery and cargo handoffs. The embedded driver task
20260924-205000-codex-01 establishes this path and a working source viewer/editor
workflow. The Lua/YAML migration remains a separate issue.

Initial findings for the next iteration:

- `world.c:supply_step` deletes delivered replenished cargo 45 seconds after
  scoring. This explains the reported disappearance. Preserve visible physical
  storage and measure sustained population cost when changing replenishment.
- `physical_failure`/`sustained_failure` removes tipped/sunk non-cargo machines
  after two seconds (following a three-second startup grace). Replace this
  immediate disappearance with a measured recovery/wreck lifecycle.
- Mining and replenishment currently use authored map positions in C. Do not
  extend those into special character powers; review how extraction/production
  can be a common world mechanic driven by physical machines.
- Existing programs already implement routes, feedback control, scouting and
  radio. New sabotage/defense must use the same interfaces and actual contacts,
  with no name/ID-specific engine behavior.

Start from the verified cave/embedded-driver checkpoint, preserve the original
saved world and complete Pi history, compile C inside Dolly, and run only one
4 GiB/no-swap disposable browser tree at a time. Use exact saved failure states,
long uninterrupted physics runs, and real Chrome/Firefox checks to validate
changes. Keep the owned 9099 preview at tested checkpoints; do not push or deploy.

September 24 late-evening experiments: a 16-block wheeled lifter with two
ordinary piston stages and a magnet overturns a real scout in a 120 s trial;
the body remains overturned for 94 s. Evidence:
`build/blockwalker-rivalry-double/`. A first guard trial failed: the magnet can
catch a bystander while its program is targeting another robot. Test programs
must verify the actual gripped object and use normal mechanics to defend or
recover. Prototypes under `build/blockwalker-rivalry/` are not yet canonical
content; defense, navigation, live-world interaction and rendering remain.
