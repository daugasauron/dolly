# Keep small lookouts clear of walking machinery

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: bug,game,physics

In the exact ore-recovery continuation of the fresh seed-42 hour, lookout 34
approaches Marrowstep near (-73,47). Their roots close from 8.75 m at 4110 s to
4.00 m at 4120 s and 2.81 m at 4130 s. The lookout rises off its wheels, tips,
and is removed at 4135.517 s. All original objects had survived the first hour.

Preserved failure and root traces:
`build/slopyard-ore-recovery-selected/segment-0720/`.
The 3960 s checkpoint is `checkpoint-360.json`; the final save records the
removal. Inspect the lookout's actual sensors, commands and contacts, then
avoid or escape close approaches through its existing motors. Do not weaken
collisions, removal criteria or the walking controller to keep it alive.
Verify the recorded encounter and continued roaming in a full population.

Reloading the 3960 s checkpoint changes the subsequent physical interactions:
the 200 s replay survives and follows a different route. Its observations do
not reproduce the original approach and are not a negative regression.
Evidence: `build/slopyard-scout-traffic-baseline/`. Resume from the same
3600 s input as the original failure to capture the later approach in one run.

The original 3600 s input reproduces the removal at exactly 4135.517 s.
The lookout sees Marrowstep throughout the approach but its yielding rule
suppresses driving and leaves it turning beside the walker. Actual contacts
reach 64.930 N between Marrowstep and the lookout's rear wheel. At 4132 s its
root is lifted to 1.16 m; at 4134 s it is 1.70 m high and overturning.
Evidence: `build/slopyard-scout-traffic-original/`, including physical saves
at 4110.017 and 4128.017 s, sensors, controller memory and contact forces.

The 90 s near-encounter comparison loads the physical 4110.017 s save with all
60 original objects. The old controller survives this reload but closes to
3.386 m and incurs 177.962 N of walker contact. The escape candidate remains
at least 6.411 m away, has zero walker contact, minimum up 0.99542, and no
removals. It uses its ordinary wheel motors, preserves terrain avoidance,
reverses when appropriate and replans after giving way. All five small
lookouts receive the same response. No walker or physics rules change.
Evidence: `build/slopyard-scout-escape-candidate/`.

The current 60-controller catalog passes 60,000 actual in-Wasm calls, an
additional 1,000-call paused-controller case and all five runaway checks.
Evidence: `build/slopyard-final-controller.log` (exit 0).

All five lookouts survive the uninterrupted 90-minute default-seed population.
Minimum up ranges from 0.98431 to 0.99668; final-quarter root ranges are 144.37,
175.26, 19.55, 71.14 and 60.69 m. Their controllers record 94–171 arrivals,
including continued island patrols and team reports. All 60 originals survive.
Evidence: `build/slopyard-continuous-population-fresh0-90m/summary.json`.
The image-22 2400 s population retains all five lookouts, minimum up
0.98439–0.99762. Final-quarter root ranges are 112.81, 120.04, 19.45, 39.20
and 59.22 m; the team scouts continue reporting.
`build/slopyard-continuous-population-image22-0/summary.json`.

Verified in packaged source `c092744`; the
[checkpoint](../20260923-213000-codex-01/TASK.md) records served-browser evidence.
