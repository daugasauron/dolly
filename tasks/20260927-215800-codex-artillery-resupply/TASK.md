# Move artillery forward and supply every station by ground and air

- STATUS: OPEN
- PRIORITY: 310
- TAGS: game,logistics,combat

Each of the eight slingshots should sit closer to the central combat zone while
remaining in its own territory. Each needs two independent physical ammunition
paths: ground transport and air transport. Suppliers should choose needy stations
using observed geometry and ordinary team reports. Avoid a separate fleet per
gun. Reuse an existing boat to retrieve loose projectiles where practical.

Current gun centers are x=±52, combat ends at x=±32, and suppliers retain one bay
forever. Proposed centers are x=±40, with Blue infrastructure mirrored behind the
gun. Both roof stations per team need ground hoists; preserve the foundry freight
corridor. Keep old terrain versions when restoring exported worlds.

Verify both paths on both teams and ground/roof stations, shared-fleet station
switching, blocked-path recovery, actual ammunition transfer through loader/gun
and firing, and compatibility with reusable magnetic projectiles. Check aged
world performance before packaging. Evidence: build/overnight-20260928/ and
build/overnight-20260927/logistics/.

The actual five-part air→loader→gun handoff exposes a wind-up overload. In
`tethers/loaded-windup-base-v1`, simultaneous arm rotation and base slew cause
two uncommanded grip losses and no shot. Waiting until the observed bearing
error/rate are below 0.2 rad/0.2 rad/s yields a commanded shot at 104.267 s,
zero unintended losses and an actual enemy hit at 106.767 s (`loaded-windup-align-v1`).
It does not establish magnetic capture. The same generic gate passes ordinary
Hosen acquisition/firing: shot at 56.567 s versus 55.567 s, physical hit at
57.733 s, and second ammunition grip at 89.817 s (`hosen-impact-align-v1`).
Both gun programs now contain this verified gate. Supply and repeated reuse
remain open.

The staged terrain-9 layout now passes all eight air→loader→gun cases with the
five-part tether round: Red/Blue Tengu 87.217/90.267 s, Hosen 93.367/99.417 s,
north roof 150.917/159.967 s and south roof 153.917/165.917 s. Every case requires
an actual supported aircraft delivery and successive loader/gun custody of the
same round. Evidence: `logistics/air-matrix-v1/`; frozen controller candidates
are `hayabusa-eight-air.lua` and `koban-eight-air.lua` in that evidence root.
Ground pickup of rotated rounds, shared-fleet switching and boat recovery are
still unproved. These private candidates are not yet in the served image.

The northward loaded-shot replay identifies a physical self-hit: the tether's
free handle strikes gun base part 10 at 20.28 m/s and height 0.857 m
(`tethers/encounter-parts-north-v1`). Raising the axle/cup 2 m exceeds the existing
loader's reach and fails all eight air cases; that candidate is rejected.
A smaller 1 m rise, four ordinary support blocks and the unchanged loader stroke
pass the Red air→loader→gun handoff at 87.217 s (`gun-clearance/air-low-v1`).
The loader derives its dock from the observed cup. Firing clearance and the other
seven routes remain unverified for this private geometry.
