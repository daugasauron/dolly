# Keep freight cranes alive when nearby observations disappear

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: bug,game,physics

The loading crane dereferences its boat and pallet while centering a suspended
load. Shared-world sensors contain only the twelve nearest objects, so crowding
can omit either reference even while the magnet remains attached.

`build/slopyard-sensor-loss-baseline.log` reproduces removal in a real Dolly
physics process from a saved loaded crane. Thirteen closer boxes hide the boat
and cause `TypeError: cannot read property 'z' of undefined`. Moving the boat
beyond sensor range has the same result; moving the pallet causes an undefined
`centerOfMass` error. Each removes the crane on its first controller step.

Hold attached cargo and brake motors while observations are missing. Recover
when they return; retract and seek again if the load is actually lost. Verify
physical cargo retention, interrupted save/reload, resumed handoff and both
teams' deliveries without removals. Keep the sensor bound and physics intact.

The loading and receiving cranes now brake their motors and retain magnet power
while an attached load is missing from observations. The loading crane also
waits for its boat. They reacquire observations before continuing; lost loads
cause retraction and another search. Settling must be measured again after an
interruption rather than counting unseen motion as stationary.

`build/slopyard-sensor-loss-guarded.log` retains the crane in all three exact
reproductions, with zero removals. The permanent freight fixture now physically
crowds each of the three cranes during a loaded handoff, verifies the pallet is
absent from nearby observations, asserts braked motors and retained cargo, and
reloads during the interruption. After clearing the crowd, it requires ordered
physical handoffs and two scored pallets per team.

`build/slopyard-freight-regression-crowded.log` passes: 1353.117 simulated
seconds, East 16 / West 16, nine reloads, zero removals, minimum barge up 0.94400,
maximum joint separation 0.02595 m. All three interrupted cranes retain and
deliver their loads; four pallets complete the full chain. The source catalog
contains the repaired controllers; no sensor or physics changes were needed.
