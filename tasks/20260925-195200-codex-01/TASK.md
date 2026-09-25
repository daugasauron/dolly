# Abandon an airborne pickup that stays blocked by traffic

- STATUS: OPEN
- PRIORITY: 240
- TAGS: game,content,bug

West courier 60 completes three deliveries, then waits over cargo 104 from
787 through 1500 simulated seconds. Traffic clearance keeps the aircraft at
7.53 m while the parcel is at 0.485 m. Mine porter 62 occupies the approach,
waiting with 113 because parcel 112 blocks its receiving pad. The unchanged
90-second continuation reproduces the wait.

Reproduce from `build/blockwalker-compound-regressions-chrome-competition-v5/`
`salvage/blockwalker-world.json`. Preserve the bounded descent controller and
all actors. Recovery must use ordinary controls and complete another delivery.

An unbundled candidate adds a 20-second blocked-descent timeout and 180-second
job backoff. In an exact 1500→1980-second replay, changing only courier 60, it
abandons 104, picks up 112 and delivers it. Deliveries increase 3→4, minimum up
is 0.981964, and mine porter handoffs increase 4→5 after its pad becomes clear.
All 118 original actors, other programs and blueprints remain; 120 objects at
the end, no controller errors or deaths. A second blocked wait also times out.

Evidence: `build/blockwalker-compound-regressions-chrome-checkpoint-courier-traffic/`
`salvage/traffic-proof.json`, final world and full trace. Candidate:
`build/blockwalker-checkpoint-followup/courier-traffic.js`.
The served checkpoint remains `ce3a392`; fresh combined verification and
packaging are still required before closing this task.

Fresh combined trial: courier 60 completes six deliveries, performs one blocked
pickup yield and stays upright (sampled minimum up 0.930387). The overall trial
fails storage/firing quotas and reveals another porter tip. Keep the
candidate unbundled; this is component evidence, not a passing combined result.
