# Recover aircraft after a tether capture leaves them grounded

- STATUS: OPEN
- PRIORITY: 250
- TAGS: game,controllers,physics

The fresh populated `build/living-world-20260926/long-fresh` run exposes a
remaining recovery failure. At840s and960s, East's courier31 is free of magnets
but remains tilted at up0.447 near the quarry's west side (x71.4,y1.55,z−34..−37).
Its Lua recovery branch is active; this is not a stopped controller. The tower
has one recorded capture. Keep the actual checkpoint-0960.lua as reproduction
input; preserve its poses, terrain, existing programs and traffic.

The recovery program currently requests attitude torque through the existing
opposed thrusters and releases its own magnet. Flat-ground forced inversion
already recovers and resumes deliveries (`courier-recovery` evidence in the
living-world task); that does not prove recovery beside obstructing terrain.
Measure contacts and actuator forces before changing gains or geometry.

Complete after the actual grounded incident recovers to sustained flight and a
new delivery, without moving bodies directly, reducing the captor's strength or
adding actor-specific engine behavior. Test the same generic controller against
flat inversion and a fresh populated run. Preserve20Hz controllers,60Hz physics,
actual magnetic capture, save/restore and useful teammate rescue behavior.

Later checkpoints refine the failure: by2160s the courier is upright and free
near(70.2,5.5,-56), with recovery mode cleared; guard46 has been working on it.
It then remains in the same location through2760s, beneath the quarry roof.
The ordinary return controller requests32m cruise height and restricts lateral
speed until it climbs. This prevents leaving the covered passage. A candidate
uses observed terrain boxes to choose a clear horizontal exit and a flight
height below the ceiling. It is being tested from checkpoint-2160.lua; no body,
terrain or actuator forces are changed. Physical contact/event evidence is still
needed before attributing the earlier righting to a particular guard.

`courier-ground-contact` refines the earlier diagnosis: the tilted pose is on
flat ground, not wedged against a wall. The magnet supports33.316N of the39.245N
weight, with rear-body/jet contacts supporting the rest. Existing thrusters
supply72Nm pure torque and no net thrust; the body remains at up0.447. The long
trace confirms guard46 gripping at2106.033s and releasing at2109.117s, followed
by an upright courier beneath the roof at2160s.

The unchanged90s replay remains beneath that roof. The first clearance candidate
lowers safely to5.1m but finds no exit because its conservative horizontal margin
already overlaps a neighbouring raised pad. The next version allows departure
from an existing margin overlap while rejecting paths farther into it. Its
300s physical replay is pending.

The revised `courier-roof-departure` passes the ceiling-escape case. The matched
baseline stays at(70.24,5.515,-56.05) for90s. The candidate leaves the covered
passage, climbs and resumes travel; its300s run has no controller errors, deaths
or lost actors. It encounters the unchanged interceptor again: physical grips
at2178.400,2220.717 and2264.367s, with releases after the first two. The third
capture persists. This is a real return to flight and further opposition, not a
new delivery or a complete independent ground-recovery fix. The ceiling program
is promoted; the broader grounded-recovery task remains open.
