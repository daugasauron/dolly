# Keep the loading quay clear between hauler deliveries

- STATUS: OPEN
- PRIORITY: 250
- TAGS: bug,game,physics

The 60-object continuation stalls at the loading quay. At 2670, 2850 and
3030 s, the hauler stays at (-41.997,105.845), trapped beside stacked pallets
85 and 88 while the crane waits for it to leave. Actual contacts reach
52.335 N against the upper pallet, 15.601 N against the crane and 60.211 N
against the quay. Reproduction: `build/blockwalker-hauler-jam-baseline/`;
input: `build/blockwalker-competition-after-traffic-hour-7/segment-3030/`.

Repair `ee7b0f4` holds the next loaded hauler at z=98 while the pad is occupied,
keeps its arm raised during withdrawal, parks the idle crane over water and
lifts the upper pallet first. Barges also yield to an occupied berth and use
ID priority to resolve simultaneous arrivals from their waiting positions.
These are ordinary motor/controller changes; bodies and collisions stay physical.

Verification:

- The delayed-service fixture first reproduces the old double deposit
  (`pad<=1` fails). Evidence: `build/blockwalker-quay-delay-old-catalog/physics.log`.
- The repaired fixture completes at 1472.500 s: East 16 / West 16, eleven
  reloads, four complete five-carrier chains, zero removals, minimum barge
  up 0.93878 and maximum joint separation 0.02782 m. It holds a second load
  behind the occupied pad, reloads, releases both boats together, and hides
  each crane's cargo observation briefly. `build/blockwalker-quay-delay-priority.log`.
- The exact stacked-pallet replay clears both loads onto barges; that run
  stops for the separate [walker failure](../20260924-132700-codex-01/TASK.md).
  With that repair too, the 2310–3750 s continuation preserves all 60 originals
  through eight reloads and five further heavy deliveries. Pallets 85/88
  finish at 2930.567/2972.433 s; later 90/94 finish at 3520.567/3607.967 s.
  `build/blockwalker-navigation-population-hour7/summary.json` records the traces.

The freight fixture now also includes a distracting light parcel by the lift;
that follow-up belongs to [continuous supplies](../20260924-144000-codex-01/TASK.md).
Remaining: package and verify the served checkpoint.
