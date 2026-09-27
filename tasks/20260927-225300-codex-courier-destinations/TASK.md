# Keep cargo couriers safe when their team has no destination

- STATUS: CLOSED
- PRIORITY: 260
- TAGS: game,controllers,compatibility

A Blue courier in terrain 0 can collect neutral freight, then fault in `lift`
when it dereferences the missing team depot. That old terrain exposes only the
Red island destination. The current production map has both destinations.

Acceptance: without its team depot, the courier must not claim new transport
work. If destination metadata disappears during a real delivery, retain the
load while lowering it onto measured external support, then release safely.
Normal collection must resume if the destination returns. Do not invent a goal
or award a delivery. Preserve ordinary flight and airborne traffic clearance.

Verified in Dolly: `build/overnight-20260928/team-audit/depot-v2/inspection.txt`.
The maintained `test/fixtures/blockwalker-courier-depot.c` is the exact passing
fixture. The courier leaves nearby freight unclaimed for 45 s without its depot;
with a valid depot it physically picks up and lifts the load at 42.133 s. Removing
only destination metadata makes it lower and release at 49.867 s, with 2.278 N
external support and rotated cube-corner clearance of -0.04 mm. It awards no
delivery and does not re-grab while the depot is absent. Restoring the depot
resumes ordinary work, with a real grip at 110.050 s. No force or traffic-control
changes were required.
