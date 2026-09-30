# Abandon an airborne pickup that stays blocked by traffic

- STATUS: OPEN
- PRIORITY: 240
- TAGS: game,content,bug

West courier 60 completes three deliveries, then waits over cargo 104 from
787 through 1500 simulated seconds. Traffic clearance keeps the aircraft at
7.53 m while the parcel is at 0.485 m. Mine porter 62 occupies the approach,
waiting with 113 because parcel 112 blocks its receiving pad. The unchanged
90-second continuation reproduces the wait.

Reproduce from `build/slopyard-compound-regressions-chrome-competition-v5/`
`salvage/slopyard-world.json`. Preserve the bounded descent controller and
all actors. Recovery must use ordinary controls and complete another delivery.

An unbundled candidate adds a 20-second blocked-descent timeout and 180-second
job backoff. In an exact 1500→1980-second replay, changing only courier 60, it
abandons 104, picks up 112 and delivers it. Deliveries increase 3→4, minimum up
is 0.981964, and mine porter handoffs increase 4→5 after its pad becomes clear.
All 118 original actors, other programs and blueprints remain; 120 objects at
the end, no controller errors or deaths. A second blocked wait also times out.

Evidence: `build/slopyard-compound-regressions-chrome-checkpoint-courier-traffic/`
`salvage/traffic-proof.json`, final world and full trace. Candidate:
`build/slopyard-checkpoint-followup/courier-traffic.js`.
The served checkpoint remains `ce3a392`; fresh combined verification and
packaging are still required before closing this task.

Fresh combined trial: courier 60 completes six deliveries, performs one blocked
pickup yield and stays upright (sampled minimum up 0.930387). The overall trial
fails storage/firing quotas and reveals another porter tip. Keep the
candidate unbundled; this is component evidence, not a passing combined result.

The same pickup wait now reproduces on East courier59 during the channel
payload-defense experiment. At900s, it has waited since598.1 over parcel122 at
(66.822,0.485,16.720), holding altitude8.505 with its magnet powered but unattached.
Tender111 is7.22m away, within its traffic exclusion distance; clearance raises
the commanded height above the magnet's reach. Tender111 itself waits for a free
ammunition bay. Gun106 has never seen a loaded enemy and remains holding its first
round. The900s save is retained under `build/slopyard-compound-regressions-`
`chrome-payload-defense/salvage/progress-payload-0900.json`; the diagnostic was
stopped after this save, not reported as a completed1800s test.

Both current couriers have identical source. The existing20s traffic backoff
adds only four lines to that source and preserves clearance and thrust limits.
Prepared continuation, not run: `build/slopyard-payload-defense/`
`{channel-courier-catalog.json,channel-courier-defense.c}`. Load the900s save and
change only59's program; preserve all actors. Require another courier delivery
and independently measure projectile contact/cargo grip loss; no weaker opponent
or automatic detachment. Maximum900s additional simulation.

Latest fresh payload-couriers trial stopped for checkpointing after its1200s save.
East59 has three deliveries and two blocked-pickup yields; West60 has five
deliveries and is carrying129. All111 originals remain among130 objects, with no
controller errors/deaths. This supports continued investigation, but the combined
defense fixture is unfinished and these programs remain unbundled. Image41 is the
served checkpoint. Evidence: `build/slopyard-compound-regressions-chrome-`
`payload-couriers/salvage/progress-payload-1200.json`.
