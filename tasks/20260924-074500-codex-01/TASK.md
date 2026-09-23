# Build an island cargo competition through the industrial mainland

- STATUS: OPEN
- PRIORITY: 250
- TAGS: game,physics,world,teams

September 24 steering for the active Blockwalker playground goal: two island
teams compete over cargo from the central landmass. Add abandoned industrial
spaces, elevators and covered passages that make flying alone insufficient.
Explore scout communication, crane/boat chains, parachute deliveries and cargo
emerging from the ground. Different physical weights should reward different
machines. Preserve the existing playable checkpoint and learned saves.

Prototype direction: East and West islands, teal and amber crews, a neutral
industrial mainland. Light parcels descend under parachutes; dense cargo rises
from a factory lift beneath a roof. Scouts report visible cargo over team radio.
Collectors, loading cranes, barges and island unloading cranes cooperate to
deliver it. Weight, clearance, buoyancy and motor/magnet strength determine what
can be carried; do not implement arbitrary bans on aircraft carrying heavy loads.

Completion requires measured end-to-end physical handoffs for both teams,
visible scores and radio activity, varied but bounded replenishment, and actual
terrain collisions matching the GPU scene. Show that a scout discovery changes
another robot's job and that heavy cargo needs the intended chain with the
provided machines. Preserve score, supply timing, radio/job state and loaded
cargo across save/reload. Existing worlds must retain a compatible map and
their complete characters/controllers/history. Verify in the browser, compile
C inside Dolly, keep the one-browser 4 GiB/no-swap constraint, and avoid image
rebuilds until a source prototype earns packaging.

Baseline: `d935654`, image SHA-256
`a01ebdb9e7d33fa2a3deaa462b21a4861b143c754b0f2e09aea5aa3c57f965c1`.
The current 51-object world remains served on port 9099 while prototypes run in
disposable browsers. The earlier playground task is
[20260923-213000-codex-01](../20260923-213000-codex-01/TASK.md).
