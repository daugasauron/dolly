# Let an air courier finish setting down its load

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: bug,game,physics

During the final mine population trial with seed 42, East air courier 59 remains
in its lower phase from approximately 300 s through at least 660 s. The machine
survives, but its delivery stops. Evidence is being collected in
`build/blockwalker-mine-continuous-final42/`. Inspect the actual attached cargo,
clearance and contact forces in the saved state; verify release and scoring by
replaying the world with its original physics and controller memory.

Checkpoint 600 shows light air parcel 73, not a mine core. The courier holds at
y=9.06997 and chooses floor 5.56997 from nearby delivered crates. Its attached
parcel has no supporting contact. A 0.6 m descent still leaves it unsupported;
the neighboring crate estimate is not the actual surface below the load.
The controller now descends slowly until measured support permits release,
bounded by terrain clearance rather than the neighboring-crate estimate.

`build/blockwalker-lower-resume-contact/` replays checkpoint 600 with unchanged
poses, velocities, attachments and controller memory. The original remains
stuck for 15 s. With only the two courier programs replaced, courier 59 releases
on supporting contact after 7.65 s and scores its first delivery. The full
population survives the following 120 s without removals; minimum courier up
0.98926. The fix changes actuator commands from sensor feedback, not physics.
