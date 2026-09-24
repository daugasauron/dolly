# Keep Amberguard walking away from the mainland edge

- STATUS: OPEN
- PRIORITY: 250
- TAGS: bug,game,physics

The 60-object continuation eventually loses Amberguard (2) at 3244.783 simulated
seconds. Its root tips at (104.09, -6.69), beyond the mainland's x=100 edge.
It began at x=17 and accumulated lateral drift despite its home-line steering.
At 3210 seconds it is still upright at (97.51, -14.51), without nearby actors.

Replay state before the fall:
`build/blockwalker-quay-recovery-cleared/segment-3210/blockwalker-world.json`.
The continuation log and root/phase traces preserve the removal and preceding
walking. This is independent of the loading-quay handoff being repaired there.

Measure the steering and foot contacts, prevent uncontrolled lateral drift and
avoid edges using actual observations. Preserve articulated walking; no hidden
forces, artificial anchoring, physics exemptions or teleporting back home.
Verify a long trial including reversals, terrain safety and save/reload, with
independent foot contact/movement evidence.
