# Make ordinary artillery affect cargo missions through physics

- STATUS: CLOSED
- PRIORITY: 70
- TAGS: game,physics,controllers

Matched active-courier tests keep the opponent, cargo mission, gun hardware,
forces, terrain and recovery controller unchanged. Only projectile construction
or visible aiming code differs. No production artillery changes are adopted.
Evidence: `build/overnight-20260928/team-audit/ordinary/`.

| Private case | Result |
| --- | --- |
| Single alloy box, wing aim | Delivery 199.167 s versus 196.617 s idle; no cargo loss. |
| Three alloy boxes, COM aim | Native 2.738019 kg; hit at 14.51 m/s pushes the courier backward 15.30 m. Delivery 217.667 s versus clean idle 196.617 s: 21.050 s delay, followed by normal recovery and delivery. Second round loads at 76.583 s. |
| Three boxes, exposed cargo aim | Actual parcel contacts at 2.53/2.19 m/s, no detachment; only 0.150 s delay. |
| Single ballast box, same mass | Loads normally but never meets the unchanged 1.15 m aim tolerance; accidentally detaches at 82.117 s. Not a drop-in replacement. |

`heavy-idle-v1` and `ballast-idle-v1` use ordinary zero-speed arm commands,
with zero shots and zero accidental releases. Do not use `heavy-nofire-v1`
as a control: merely suppressing release leaves the arm spinning until grip fails.
The exact valid opponent source is frozen in each archive; comparison artifacts
record the source hashes, real contacts, release/impact speeds and engine scoring.

The three-box shot is useful but still private. Current shared supply filters
reject ammunition above 1.5 kg. Declared hardware forces suggest 2.738 kg is
feasible; this does not prove dynamic stability or every loading route. Private
capacity proposals use observed gravity and actual actuator/grip/thrust limits,
not actor IDs. They are unverified and must be rebased onto final supplier sources.

Complete only after actual air, ground and hoist supply/reloading passes for all
six Tengu-program and two Hosen stations, with physical friendly/terrain checks
retained and no weakening of the opponent. Otherwise preserve this measured
finding and leave the existing production guns unchanged.

## Closed (2026-10-01)

Closed as an unadopted experiment. The only useful private result, a three-box
round delaying a courier by 21 s, never reached the catalog, and its evidence
(build/overnight-20260928/) is gone. Artillery effects on cargo are one line in
`20261001-223000-slopyard-living-world`.
