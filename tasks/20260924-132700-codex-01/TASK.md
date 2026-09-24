# Keep Amberguard walking away from the mainland edge

- STATUS: OPEN
- PRIORITY: 250
- TAGS: bug,game,physics

The 60-object continuation eventually loses Amberguard (2) at 3244.783 simulated
seconds. Its root tips at (104.09, -6.69), beyond the mainland's x=100 edge.
It began at x=17 and accumulated lateral drift despite its home-line steering.
At 3210 seconds it is still upright at (97.51, -14.51), without nearby actors.

Replay state before the fall:
`build/blockwalker-quay-recovery-cleared/segment-3210/blockwalker-world.json`.
The continuation log and root/phase traces preserve the removal and preceding
walking. This is independent of the loading-quay handoff being repaired there.

Measure the steering and foot contacts, prevent uncontrolled lateral drift and
avoid edges using actual observations. Preserve articulated walking; no hidden
forces, artificial anchoring, physics exemptions or teleporting back home.
Verify a long trial including reversals, terrain safety and save/reload, with
independent foot contact/movement evidence.

Three isolated 600 s gait trials all remain upright (minimum up 0.987), but
increasing heading/cross-track gain does not cure the drift. The old controller
ranges x=-0.21..17.70, the stronger variant x=16.63..51.82, and the intermediate
variant x=-21.63..17.08. Each starts at x=17 with three reloads. These variants
are rejected; traces show heading correction lags changes of walking direction.
Evidence: `build/blockwalker-amber-steering-gains/`.

A constant-heading physical trial proves turning through differential stance
leg speeds is possible. A navigation prototype then selects flat observed
destinations around home and slows while changing heading. Its isolated 600 s
trial stays within 20.845 m of home, reaches twelve targets, and has no removals
or phase resets. Independent corner/contact samples count 757 airborne advances
followed by supported landings, 193 in the final quarter. Evidence:
`build/blockwalker-amber-steering-navigation/`.

The very late 3210 s save is not recovered: its outer feet are already beside
the cliff and turning expands the footprint over the edge. The new controller
falls into the water and becomes stuck despite no removal being recorded.
`build/blockwalker-amber-edge-navigation/` deliberately fails the minimum-up
criterion (0.09263). Do not count survival alone as a pass. The combined replay
now starts earlier, at 2310 s with x=77.13, using footprint-aware destinations
and nearby-traffic replanning. The original late save remains preserved.

The combined replay passes from 2310.017 to 3750.017 simulated seconds with
all 60 original objects, zero removals, eight process/world reloads and five
further heavy deliveries. Amberguard walks back from x=77.13 to its home area,
chooses 39 destinations, and ends at (14.84, -2.83), upright, still cycling its
gait. Evidence: `build/blockwalker-navigation-population-hour7/`.

Fresh isolated starts at both shores also pass 900 s each and four reloads.
The navigation variant stays x=-92.25..-69.37 from the west start and
x=75.77..90.49 from the east start, with minimum up 0.97768 / 0.97969.
The old western controller also survives this trial, but approaches x=-98.36;
this is not a negative reproduction of the original fall. Evidence:
`build/blockwalker-amber-steering-shores/`.

The canonical candidate keeps the same articulated body, adds observed flat
footprint destinations and nearby-traffic replanning, and removes the inactive
fault-injection branch. Remaining: fresh continuous population, targeted home
return verification, controller/browser checks and packaging.
