# Keep friendly rescue traffic clear of a loaded slingshot

- STATUS: OPEN
- PRIORITY: 230
- TAGS: game,content,bug

In the unbundled checkpoint-combined trial, West slingshot 87 remains in load
from 957.7 through 1500 simulated seconds, holding parcel 91 on its powered
magnet. Loader 88 has released the parcel and is idle. The slingshot fires three
times, missing the existing four-shot quota; its mechanics remain intact.

The final saved pose places friendly guard 73 inside the swing-clearance check:
guard radius 4.823 m, root distance 9.812 m, available clearance 4.989 m against
the program's required 7.395 m. The guard is approaching teammate 71 for a rescue.
This is an observed reason to hold fire, not missing ammunition. Reproduce from
`build/blockwalker-compound-regressions-chrome-checkpoint-combined/`
`salvage/blockwalker-world.json`; sources and all machine blueprints are preserved.

Investigate generic coordination or path planning that moves friendly traffic
out of the sweep and lets the loaded gun resume. Preserve captures, rescues and
the safety check; do not move actors by hand or weaken collision protection.
Verify the same loaded parcel is subsequently fired, with no crew collisions.
The served image remains the earlier stable checkpoint; this trial is unbundled.
