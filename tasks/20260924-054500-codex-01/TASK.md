# Recover Marrowstep from a stalled lift

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: bug,game,physics

The fresh seed-42 population survives 1200 simulation seconds, but Marrowstep
stops translating. Its final gait state remains phase 0 since 830.0667 s.
Physical root samples from 900–1200 s have effectively zero travel; the walker
is unanchored and upright. Survival alone did not detect this inactivity.

Reproduce from `build/slopyard-tug-skybarge-fresh-42/slopyard-world.json`.
The associated `tug-trace.csv` and `late-activity.json` identify the stall.
Inspect actual joint angles, foot clearance and contacts, then make the gait
recover using its existing motors and sensors. Preserve normal physics and the
learned biped. Completion requires recovery of the saved stalled state and a
fresh longer populated-world check with measured continuing foot placements.

The exact 1200–1230 s replay stays in the same lift phase. Its active knees
reach the requested 1.38 radians, but one foot's clearance estimate remains
0.037 m, below the unchanged 0.12 m lift gate. The other diagonal supplies ground
support; no self-contact or contact with another creature occurs in that replay.
Evidence: `build/slopyard-marrowstep-baseline/` and matching log.

A 1.52-radian lift target, within the existing 90-degree knee limits, clears the
saved stall in 0.4 s. Over the next 90 s the controller enters 66 swing phases,
all 49 objects survive, minimum up is 0.99543 and the root spans 23.34 m.
Physical corner/contact samples also catch occasional foot scuffing during
backward swings; this is not a claim of 66 entirely clear airborne placements.
Evidence: `build/slopyard-marrowstep-raised/{result.json,marrow-sensors.jsonl}`.
The full trial exceeded its 260 s harness limit before exporting results. A
segmented rerun preserved checkpoints every 180 simulation seconds and exposed
another stall: phase 0 since 821.2833 s, still stuck at 900 s. All 49 objects and
eight deliveries survive, but continued walking fails. The run was stopped after
preserving the 900 s state. The 1.52-radian candidate is rejected, not packaged.
Evidence: `build/slopyard-marrowstep-segmented-42/segment-0900/` and the
matching log. A five-second replay confirms the new equilibrium: both active
knees reach 1.52, but the lower foot has only 0.083 m physical corner clearance.

The accepted controller keeps the original 1.38-radian target and adds a physical
replant when a phase makes no progress for four seconds: lower all knees, center
the hips, wait for four planted feet, then retry with the opposite diagonal.
No pose changes, extra forces or relaxed lift criteria are used. Recovery tests
started from both independently captured stalled states before a fresh long run.

Both 90 s failure replays passed with all 49 objects alive. Replanting completed
in 1.3 / 1.4 s; the final planted samples show positive support on all four feet
(minimum 10.44 / 12.81 N). Minimum up was 0.99318 / 0.99506. The controllers
subsequently entered 56 / 59 swing phases with one replant each. Evidence:
`build/slopyard-marrowstep-{replant-original,replant-second}/result.json`,
their sampled body/foot data and matching logs.

The fresh seed-42 run passed 1200 s and six process restarts: all 49 objects,
zero removals, eight deliveries. Independent 0.1 s foot samples recorded 1540
supported placements following airborne advance over 0.1 m, including 398
after 900 s. Minimum up was 0.98953, root range 28.88 m, longest phase interval
4.0 s and one replant. There were 54 loaded swing-foot samples out of 4736;
occasional scuffing remains. These are sampled physical events, not a claim of
perfect gait cycles. Evidence: `build/slopyard-marrowstep-replant-fresh-42.log`
(exit 0) and `build/slopyard-marrowstep-replant-fresh-42/{result.json,placements.json}`,
with per-segment poses, controller states and foot traces.

The permanent regression uses the captured original stalled pose, velocities,
held controls and controller memory with the current catalog body and program.
In its 15 s isolated simulation, the original program moves only 0.003 m and
fails the recovery assertion; the candidate moves 4.368 m with minimum up
0.99709 and passes. `build/slopyard-marrowstep-regression2.log` exited 0.
An earlier minimization used the different 1.52-radian state with the original
1.38-radian controller; that combination did not reproduce the stall and was
discarded. The assertion was retained with the matching recorded state.

The packaged driving/physics suite passed with the new regression, 11.61 m of
keyboard driving, 74 Eyes samples and actual pickup. The actual 9099 preview
matched every fresh catalog controller and imported the 1200 s world through
the normal UI. Marrowstep moved 3.74 m while viewed through follow/Eyes cameras;
all 49 objects remained alive and there were no browser errors. Both screenshots
were inspected. Logs: `build/slopyard-marrowstep-{driver1,preview1}.log`;
artifacts: `build/slopyard-driver/` and `build/slopyard-marrowstep-preview/`.

The local image was rebuilt in 23.1 s using the unchanged runtime:
232138511 bytes, SHA-256
`742a7d247d68e8db626045f0f573f54ad46fdd319d42834a01ff3c886127f9b1`;
source SHA-256 `33c800f114d3e711967c4d2521b62e89b8e9a56a2bc86283827601952c8a17cd`.
Evidence: `build/slopyard-playground-image15.log`. The failure replays,
fresh population, short regression and served image checks are complete.
