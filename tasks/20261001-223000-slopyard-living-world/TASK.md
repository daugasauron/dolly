# Slopyard living world: measured stalls on the current catalog

- STATUS: OPEN
- PRIORITY: 60
- TAGS: game,controllers,cargo,combat

One list of what the fresh catalog actually does, replacing twenty September
game tasks whose saves, candidates and evidence no longer exist (each closed on
2026-10-01 with a note). Measure before changing a controller, and re-run the
audit after: a fix should raise deliveries or remove a stall without new
falls, removals or controller errors.

## Reproduce

`audit.c` runs the fresh catalog (or a saved world) inside Dolly and prints,
per actor, path, grips, deliveries, uprightness, the longest time fallen and the
longest time stationary while holding something, with the controller status at
that moment; it saves the final world. With a GPU display:

    DISPLAY=:N node tasks/20261001-223000-slopyard-living-world/run.mjs OUT \
      tasks/20261001-223000-slopyard-living-world/audit.c 2400 [WORLD.lua]

2,400 simulated seconds take about 25 minutes. The simulation is
deterministic: the same save and sources give the same deliveries, so a
program change can be compared by replaying one save with only that actor's
`source` replaced.

## Baseline (2026-10-01, before `3cd1709`)

Fresh world, 139 actors growing to 183, terrain 8: 40 deliveries (East 21,
West 33 points), no removals or controller errors, both bipeds upright
(minimum up 0.981 / 0.971). The six cargo aircraft made 36 of the deliveries;
the carousel chain (Nekote 8 jobs → Kaiten 10 handoffs → Mochi 6 trips) and the
West sea chain (Oreki → Kishi → Shio → Aoba → West receiving crane, 3 heavy
pallets) work. Guns fired 14 shots.

## Open problems, as measured

- Foundry freight chain never delivers. The tandem-mast hauler takes the first
  pallet, then (fresh run) dances at its first corner because waypoints need
  0.3 m arrival, hits the shaft post at (-39.7, 58.7) at 234 s, is left tilted
  on it and overturns at 1,904 s; the ore lift waits in `unload` forever. Its
  route to the quay (x = -43 through the hall opening) is blocked by the Blue
  Yagura ammo hoist standing at (-43, 86) since the rooftop supply was added,
  and its stuck recovery restarts the route from waypoint 0, which crosses the
  shaft pit. The quay crane, both barges, the East receiving crane and the East
  forklift therefore never move a pallet. `slopyard-competition.c` covers this
  chain and fails (no stage reached in 474 s).
- Oreki (mine porter) holds a core sample for 962 s, deadlocked with Tonbi West
  beside a loose tether round near (-68, -15).
- Four of eight guns never fire in 2,400 s: both Yagura roof batteries and the
  Blue Hosen hold a round reporting "Watching combat zone"; the Red roof sling
  stays in `hold` after two misloads. Gun placement (x = ±52) leaves their
  sectors empty; forward placement and shared ground/air resupply were explored
  privately in September and not adopted.
- Idle capacity: both Kanagu cable tugs, both Tsuru rescuers and both
  Kurogane collectors patrol 2,400 s without a grip. The West foundry hauler lay
  overturned for 496 s and was not righted (the West guard gripped it seven
  times; Tsuru lifts only light machines).
- The East crane boat (Akane) and the East warehouse forklift never work.
- Combat effects on cargo: hits never broke a powered magnet grip in September
  trials; tether rounds capture and are returned, but a returned round has never
  been reloaded and fired again.

## Fixed so far

- `3cd1709`: Kawasemi hovered 2,175 s over the East receiving yard (idle
  receiving crane's arm and a parked forklift inside its whole-body traffic
  clearance; floor estimate short of support). From that save it now delivers
  its three parcels in 300 s; the world gains 13 deliveries in 900 s against
  5 in 300 s unchanged.
- `07f5f58`: the foundry hauler's route avoids the Blue hoist, switches
  intermediate waypoints at 1 m and no longer restarts across the shaft pit.
  Replaying the fresh world from t = 0.1 s, and in a world of only the seven
  freight actors, it now carries pallets to the quay and the West receiving
  crane scores them (8 points at 1,041 s and 1,119 s). It is not yet robust:
  see below.

## After those fixes (2026-10-02, sources at `1650d48`)

Fresh 2,400 s audit: 36 deliveries (East 21, West 22 points), no removals or
controller errors; one sample per state, so the totals are not comparable with
the baseline's 40 (the run diverges early). Kawasemi delivers twice with no
loaded hover over 1 s, and Oreki's longest loaded wait drops to 348 s. Still
open from this run:

- The foundry hauler again stalls in `clear`, upright, straddling the shaft
  post at (-41.1, 57.7) for 2,152 s. A per-second trace of the same fresh run
  shows it reach the first corner at 135 s, turn in place near (-37.5, 57)
  for about a minute with the raised pallet (at 180 s pointing north-east
  toward the hall pillar at (-33, 63), with the West guard's wheels beside
  it), drift west onto the post by 210 s and stop; `clear` then reverses with no exit when the retreat is
  blocked, and `carry` ignores terrain obstacles (`avoid = false`).
- Tonbi East waits 604 s in `lower` at (65.0, -25.3) and Tonbi West 493 s in
  `wait_bay`; Kaiten 153 s holding in `lower`.
- Both Yagura roof batteries and the Blue Hosen still never fire (15 shots
  from the other five guns); the Red roof sling and Blue Tengu hold a round
  for 1,972 s and 1,271 s "Watching combat zone".
