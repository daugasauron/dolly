# Add a physical quarry-to-courier handoff

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: game,content,physics

The new quarry road should support actual cargo work beneath its roof. Add a
small wheeled runner that climbs, grips a core, reverses down the road, lowers
it onto the ground and reports it over team radio. The existing air courier
must collect the released load and deliver it to the island. Keep movement,
clearance and handoff decisions in the runner's editable embedded program.

The isolated `build/slopyard-terrace-heavy-motors/` trial completes 900 s.
Its 11-block runner uses a normal piston, magnet and four 36 Nm wheel motors.
It transports both 2.738 kg cores down the real staircase. The unchanged East
air courier scores them at 258.067 and 442.150 s. All four bodies remain, no
controller errors occur, and minimum runner uprightness is 0.9627. An earlier
18 Nm version stalled on the second loaded climb; changing the actual motor
specification fixes that mechanical limit. No pose or movement helper was added.

The extended quarry roof covers the pickup gallery. The two cores are authored
stock, not a new replenishment mechanic. Verify the populated world, browser
views, source export and both existing receiving chains before packaging.

The combined 1200 s seed-42 run also completes both handoffs: cargo 80/81 moves
from runner 79 to courier 59, then settles on the East island with one delivery
each. Runner minimum up is 0.9640; all 103 world bodies remain without errors.
Evidence: `build/slopyard-rivalry-combined42/{rivalry.jsonl,report.json}`.
Both-yard storage and crowded Firefox performance still block promotion.

The 1800 s one-way-engine repeat also delivers both cores, with 28 total
deliveries and all 121 objects retained (`build/slopyard-rivalry-compact-tuned42/`).
The runner, stock and longer roof are now in the branch catalog. The served
image is still 27; final storage, camera/source and crowded-browser checks remain.

Closed at the image 28 checkpoint. The fresh 2400 s world repeats both physical
runner/courier handoffs with unique credit and all objects retained
(`build/slopyard-rivalry-checkpoint42/checkpoint-proof.json`). Quarry camera
views and source export pass in Chrome and Firefox. Both browsers launch the
packaged terrain-3 catalog and restore all 125 objects from the populated save
(`build/slopyard-image28-preview/` and `-firefox/`). Warehouse endurance and
crowded-world performance remain separate open issues.
