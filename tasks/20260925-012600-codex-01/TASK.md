# Add a physical quarry-to-courier handoff

- STATUS: OPEN
- PRIORITY: 200
- TAGS: game,content,physics

The new quarry road should support actual cargo work beneath its roof. Add a
small wheeled runner that climbs, grips a core, reverses down the road, lowers
it onto the ground and reports it over team radio. The existing air courier
must collect the released load and deliver it to the island. Keep movement,
clearance and handoff decisions in the runner's editable embedded program.

The isolated `build/blockwalker-terrace-heavy-motors/` trial completes 900 s.
Its 11-block runner uses a normal piston, magnet and four 36 Nm wheel motors.
It transports both 2.738 kg cores down the real staircase. The unchanged East
air courier scores them at 258.067 and 442.150 s. All four bodies remain, no
controller errors occur, and minimum runner uprightness is 0.9627. An earlier
18 Nm version stalled on the second loaded climb; changing the actual motor
specification fixes that mechanical limit. No pose or movement helper was added.

The candidate extends the existing quarry roof over the pickup gallery.
Sources and blueprints are under `build/blockwalker-terrace/`; they are not yet
the canonical catalog. Verify the combined populated world, browser views,
source export and both existing receiving chains before promoting. The two
cores are authored stock, not a new replenishment mechanic.

The combined 1200 s seed-42 run also completes both handoffs: cargo 80/81 moves
from runner 79 to courier 59, then settles on the East island with one delivery
each. Runner minimum up is 0.9640; all 103 world bodies remain without errors.
Evidence: `build/blockwalker-rivalry-combined42/{rivalry.jsonl,report.json}`.
Both-yard storage and crowded Firefox performance still block promotion.
