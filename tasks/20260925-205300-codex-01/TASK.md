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

Further saved-state inspection: guard73 is fully inverted (up−1.000000), not
merely standing in the way. Its program sets all wheel commands and lift to zero
below up0.2, so route yielding alone cannot recover this state. Teammate71 is also
fallen (up0.117727) but farther from the gun. `build/blockwalker-guard-recovery/`
contains an unrun matched120s replay and a generic program candidate: extend the
existing hydraulic forks while overturned, then resume patrol after stabilizing
upright. No added forces, moved actors or changed opponents. Require physical
recovery, at least10s upright, the same loaded round91 fired, no friendly hits and
no actor losses/errors. Test input remains the exact1500s combined save.

The matched120s `guard-righting` replay fails: baseline final up−1.000000;
existing fork rams lift the candidate to−0.708646, but neither becomes upright
or lets the loaded gun fire. Rear wheels reach the ground while the vehicle
leans on its extended forks. Both retain all actors, with no friendly hits or
controller errors. Evidence:
`build/blockwalker-compound-regressions-chrome-guard-righting/salvage/`.

A second paired60s `guard-traction` replay starts from that tilted1560s save.
Positive/negative wheel drive moves73 clear and gun87 fires91, but final up is
−0.710745/−0.758045 with zero upright time. No friendly hits, missing actors,
errors or deaths. Firing alone is not successful rescue; neither variant is
promoted. Evidence: `build/blockwalker-compound-regressions-chrome-guard-traction/salvage/`.
Its progress filenames end1560, but their embedded simulation time is1590.

An untested heavier teammate rescue-dozer prototype is retained under
`build/blockwalker-rescue-dozer/`. Its added ballast currently uses finish2
(glow); change to finish3 (stripe) before testing. No prototype is bundled.
Preserve captures and physical teammate rescue. Image40 remains the checkpoint.
