# Recover loaded freighters from traffic jams

- STATUS: OPEN
- PRIORITY: 250
- TAGS: bug,game,physics

The continued full-population seed-7 world exposes a stalled East barge after
the initial four heavy deliveries. At 1740, 1920 and 2100 simulated seconds,
barge 55 remains around (139.5, 62.5), still sailing toward (130, 24), with pallet
77 attached. Twinspire (19) is immediately ahead near (135.6, 58.5). The original
cast survives, but East's heavy chain stops progressing.

Reproduce from `build/blockwalker-competition-continuation-hour-7/segment-2100/`.
The matching trace records less than 0.4 m of position variation over minutes.
Inspect actual contacts and recover using existing propulsion and observations;
do not teleport boats, remove traffic, suppress collisions or enlarge the map
just to hide the jam. Verify retained cargo, resumed island delivery and further
traffic through the channel, including save/reload during recovery.

`build/blockwalker-boat-jam-baseline.log` reproduces the same jam for another
10 seconds after reload. Actual contacts connect freighter parts 51/57 to
Twinspire. Twinspire also contacts both stepped-shore boxes, including 41.75 N
and 17.09 N on two hull parts. The freighter retains the 10.952 kg pallet and
barely translates or turns. Sensors and the unchanged replay state are under
`build/blockwalker-boat-jam-baseline/`.

The candidate detects four seconds without translational progress during a
voyage, checks the water/traffic behind it, reverses for ten seconds, and retries
from the previous waypoint. Returning through that waypoint keeps the displaced
barge from cutting across the island corner. It uses existing thrusters and
retains the deck magnet; no physics or map changes are involved.

The full 60-object replay passes in
`build/blockwalker-boat-recovery-backoff.log`: pallet 77 scores eight points
after 210.017 seconds, with a reload three seconds into recovery, all original
objects retained and no removals. Twinspire resumes patrol. Minimum boat up is
0.96781 and maximum joint separation is 0.05597 m. Only one back-off occurs.

Ordinary freight trips are unchanged: the crowded-crane regression still
finishes at 1353.117 seconds with four heavy deliveries, nine reloads and no
removals; neither barge invokes recovery. Evidence:
`build/blockwalker-freight-regression-traffic.log`.

Reduction to four objects preserves the exact recorded body poses and velocities.
An earlier rigid-body approximation changed the contact configuration and did
not give a reliable replay; diagonal and relative-velocity escape experiments
against that approximation were rejected. The exact four-object replay passes
with the original back-off, without those additional controls.

The permanent `test/fixtures/blockwalker-traffic.c` constructs the current
catalog boats and receiving crane around the recorded collision. Its old-
controller run stays stuck for 300 seconds (0.286 m maximum displacement) and
fails delivery. The current controller delivers in 203.967 seconds with one
reload, zero removals and minimum up 0.96757. Both run inside Dolly through
`build/blockwalker-traffic-regression-exact.log` (overall exit 0).

`build/blockwalker-traffic-driver.log` passes the permanent browser harness:
traffic recovery, 10.943 m of real keyboard driving, 77 Eyes samples, actual
cargo pickup and no browser errors or removals. The captured regression is
self-contained C data and uses current catalog controllers.

Remaining: package the repair and resume the populated world beyond the original
traffic failure.
