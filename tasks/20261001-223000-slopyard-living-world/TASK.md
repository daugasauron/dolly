# Slopyard living world: measured stalls on the current catalog

- STATUS: OPEN
- PRIORITY: 50
- TAGS: game,controllers,cargo,combat

## State (2026-10-27, the flaky-tests workstream): rounds come back to their row, none is thrown again

After v0.1.4, by the integrator's recommendation, which the owner accepted on 2026-10-27 ("the
rest of the items go with your recommendations"): what is open here is the game's controllers
(the tether rounds, the foundry chain, idle machines), not Dolly; the image and its GPU test pass
on the release candidate. The variants below are kept with their sources
(`work/evidence-2026-10-27/flaky/slopyard-evidence/src-v1` to `src-v7`) for whoever takes it up.

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

## Closed as moot (2026-11-01, from the sections this replaces; `git log` of this file has them)

Measured fixed by the 2026-10-24/27 audits, so no longer open: four guns never firing (30 shots,
all eight firing), Oreki's 962 s deadlock with Tonbi West (four handoffs, no loaded wait over
353 s), Kawasemi's hover (`3cd1709`), Benkei West stuck at 58 m (374 m), Kitsune West at 38 m
(125 m). The two edits of 2026-10-02 (hauler, team patrol) were decided on 2026-10-06 and are
not committed. Still open are the three above: the tether rounds' second throw, the foundry
freight chain, the idle machines.

## Not measured on 2026-11-01

The FFmpeg agent took this up last: in its tree the seed had changed (C's Slop), and
`slopyard`'s closure then rebuilds `rust-llvm` and `rust-build` (a hugebuild, the integrator's),
so no audit was run. The next audit runs where `slopyard` is built, with `run.mjs` and `audit.c`
beside this file.

## Reproduce

A fix is accepted when the audit after it has more deliveries or one stall fewer, and no new
fall, removal or controller error.


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
