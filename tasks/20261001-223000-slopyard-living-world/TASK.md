# Slopyard living world: measured stalls on the current catalog

- STATUS: OPEN
- PRIORITY: 50
- TAGS: game,controllers,cargo,combat,0.1.4

## State (2026-10-27, the flaky-tests workstream): rounds come back to their row, none is thrown again

Measured on `main` `f9cbff51`, one image throughout (the game sources are uploaded with each run);
evidence in `work/flaky/build/slopyard-evidence/`. The base, 2,400 s: on the GPU display (Xvfb
`:163`, `run.mjs` + `audit.c`) 40 deliveries (East 23, West 24), 183 actors, no removals or controller
errors; falls: Komame West 422 s at the end, Komame East 244 s early. The sling audit (headless) of
the same sources: 30 shots, all eight guns firing; each tether round thrown once (Blue 82.7 s, Red
84.6 s) and both brought their machine down (174 s, 217 s). That is the state of 2026-10-24
(`d6c8062c`) to the line: Oreki four handoffs and no loaded wait over 353 s, Benkei West 374 m,
Kitsune West 125 m. A per-second trace (`tether-life.c`) shows where they went: each
tug set its round down standing at its drop-off, (35.2, -50.0) at 244 s and (-35.9, -48.9) at 284 s,
20 m from the loaders, and nothing moved either again.

Why not at their places in the stock row, (±55, -25): the tug gives the place up when anything
stands within 2.5 m of it (1 m in the rejected `sling-reuse`), and the Koban loader's carriage and
head pass within 0.5 m of it at rest and over it while working (`bay-walls.c`), so it is always
given up. That place is also at the edge of the loader's reach: its head takes a box only from its
own side, and the reach ends 0.14 m beyond the place (x = ±55.135 for a box centre).

Rejected on 2026-10-24: the Tonbi trucks carrying standing rounds as they carry boxes (`sling-t14`:
they took them out of the row before they were loaded); the 1 m margin (`sling-reuse`: the Blue
round came back once, Tonbi West took it and held it 992 s), and with it the trucks leaving rounds
with a line alone (`sling-reuse2`: both still at the drop-offs). Tried today, each on the one before
unless stated (`life-v*`: 1,500 s traces; `sling-v2`, `audit-v2`, `sling-v6`, `audit-v6`: 2,400 s):

- v1: the place is kept unless something stands on the round's own footprint below 2.2 m, and the
  Tonbi trucks leave rounds with a line alone. Both rounds came back to their places (297 s, 333 s),
  but lying: the tug turned 45° at speed near the row and the round toppled. The loaders cannot take
  them so: a lying round's parts reach 0.2 to 1.3 m past the loader's reach, and Red's head, aiming
  beside the one magnet it could reach, came down on the root block (`pickup.c`).
- v2: carried steadily (steering at most 0.25, slowing in turns) and set down within 0.4 m. Red came
  back at 557 s, lying 0.32 m from its place; its loader took it at 620 s and its gun gripped it at
  647 s, 2.27 m from the magnet (the gun's grip on a standing round: 1.35 m), and it flew off the
  spinning arm at 865 s: the nearest to a second throw measured, and not one. The Blue tug circled
  3 m from its home waypoint until each 180 s return expired. Over 2,400 s: 31 shots, 32 deliveries
  on the GPU display (East 17, West 22), and a new fall (Kawasemi, 3 s at up -0.98).
- v3: the home waypoint skipped when the round is nearer its place, the last 4 m slowly with full
  steering. Red stood 0.1 m outside the reach (its pickup failed after 45 s); Blue toppled in the
  last 4 m, its loader held it by a magnet block, the root never reached the dock and the handoff
  failed after 45 s.
- v4: the rounds' places 0.3 m inward (`designs.lua`): the first loads misloaded, rejected.
- v5, v6: the round set down 0.3 m further from the loader, the last metres steady and slow, let go
  only when it stands still. Red still settled 0.66 m off (v5); over 2,400 s (v6) Red's round was
  loaded again but reached the gun lying, 2 m off its dock (two misloads), and Blue's ended behind its
  loader: no second throw, 27 shots, and on the GPU display 32 deliveries (East 17, West 22; the
  Tonbo and Yamabiko couriers 9 fewer), no new fall, removal or controller error. Not accepted.

- v7 (afternoon, v6 plus the loader): the loader takes a round on a line only by its root block,
  from its own side, where no other part of the round lies in its head's way. The first loads change
  at once: the loaders take the standing rounds at 6 s instead of 7 s, the Blue gun grips its round
  at the dock and lets go of it again four times between 52 s and 236 s without a throw, and the Red
  gun takes its round at 48 s instead of 27 s; the throws of 83 s and 85 s are lost, and neither
  round is thrown before 666 s. Why the gun lets go was not traced. Stopped after the 1,500 s trace
  (`life-v7`), not committed.

Nothing is committed: no variant throws a returned round again, and both measured over 2,400 s
deliver 32. The traces agree with the audits of the same sources to the second, so each variant is
one deterministic world; v6 parts from the base by 600 s, v2 after 1,200 s. What a fix
needs, as measured: a returned round stands within about 0.2 m of its place, on the loader's far
side of it; or the loader takes a lying round by an outer block and brings it to the dock with its
root block on top, free of the head, as a standing round arrives: the gun grips only a root block
that is the nearest part of the round to its pole (`tengu-east-cargo-slinger.lua`), and in v6 the
returned round, lying, misloaded twice, 2 m off the dock.

The other open problems, on the base GPU audit of this run:

- Foundry freight chain: unchanged. The hauler stands in `clear` at (-41.2, 57.9) for 2,023 s, the
  ore lift waits in `unload`.
- Idle capacity: the Kanagu tugs each haul once (the tether rounds), and return them as above. Both
  Tsuru rescuers scout 2,400 s without a grip; Komame East lay fallen at (43, 82) from about 100 s to
  340 s. Kurogane East claimed Komame West, fallen at (7.9, 69.1), at 2,000 s, lowered its grapple
  from 16.6 m for its 60 s deadline without a grip and gave it up (`wrecks.c`); not traced further.
  Kurogane West patrolled x -20 to 4 while Komame East lay at x 43.

## State (2026-10-13)

Not worked on since 2026-10-06, and nobody is on it: the open problems measured below stand as
measured then. No controller has changed since (the last commit to
`demos/slopyard/src/controller.lua`, `designs.lua` and `programs/` is `07f5f582` of 2026-10-01);
Box3D's SIMD paths did (`463ee297`, 2026-10-06), so a new audit run may count other deliveries
than the table's. The image's GPU test passed in the release round of 2026-10-11 (`slopyard exit 0`,
`work/rust/build/v012-evidence/round.log`). `audit.c` and `run.mjs` are beside this file; the
first step is to run the audit again (25 minutes, a GPU display) and compare.

## What this is

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

## Two edits left uncommitted on 2026-10-02, decided 2026-10-06

That agent's evidence (`work/slopyard-world/build/slopyard-world-evidence/`)
used the same game sources as today's base; the program files in each run's
`source.tar` identify what it tested. `fresh0` is the 36-delivery audit above
(base). `A2` is both edits as saved in the patch, `A1` the patrol edit with an
earlier hauler draft, `hA2` the hauler edit alone (900 s), and `g1` the patrol
edit alone (600 s). All start from the fresh world, and none has removals or
controller errors.

- Foundry hauler (waits for crossing traffic, detects a blocked route by
  progress, accepts a corner once level with it): dropped. In `A2` it leaves
  the 2,152 s `clear` stall and its pallet reaches the quay crane, but it
  overturns (minimum up -0.42, fallen 88 s) until the West guard rights it.
  In `hA2` it cycles between `carry` and `clear` 19 times without reaching the
  quay by 900 s (minimum up 0.80). That is a new fall, so the edit fails the
  acceptance rule. The recorded runs prove it, so no new run was needed. The
  foundry chain remains the open problem listed above.
- Team patrol (keeps a patrol point only if it is clear of roofs and walls):
  not committed. The recorded runs could not isolate it over 2,400 s: `A1`
  and `A2` pair it with hauler drafts, and `A1` has new falls (Mochi 1,447 s,
  Komame, Tonbo Blue). New run `P1` on 2026-10-06 used today's base with only
  this edit, from the fresh world, for 2,400 s. Evidence is in
  `work/slopyard2/build/slopyard-patrol-audit/`. Its 300 s and 600 s totals
  equal `g1`'s, so today's toolchain replays the recorded runs. Results against
  `fresh0`: 45 deliveries (East 23, West 29 points) against 36, no removals or
  controller errors, and Benkei West moves 255 m instead of 58 m. Two boats
  capsize, though, and are still capsized at the end: Shio (fallen 192 s) and
  Aoba (275 s), late and at sea, with no patrol machine near them. That is a
  new fall, so under the acceptance rule the edit is not accepted. The run
  diverges from `fresh0` before 600 s, so one run cannot show whether the edit
  causes the capsizes.

Still open from these runs, in addition to the list above:

- Benkei West (yard guard) moves 58 m in 2,400 s and is stuck by 900 s.
  Patrol points under roofs or beside walls lead it into buildings.
- Kitsune West (dock raider) sits at y = 14.3 near (-56, -60), tilted (up
  0.86), with a 38 m path in every run, base included.
