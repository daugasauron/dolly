# Keep Amberguard walking away from the mainland edge

- STATUS: OPEN
- PRIORITY: 250
- TAGS: bug,game,physics

Amberguard starts at x=17 but drifts sideways despite home-line steering. The
full-population continuation loses it at 3244.783 s, tipping at (104.09,-6.69)
beyond the mainland edge. At 3210 s it is upright at (97.51,-14.51), without
nearby actors. Save: `build/blockwalker-quay-recovery-cleared/segment-3210/`.

Repair `7b430b3` keeps the same articulated body and gait. It selects observed
flat footprints around home, slows while turning and replans around traffic.
There are no hidden forces, anchors or teleports. Increasing steering gain
alone did not cure drift. The inactive fault-injection branch is removed.

Verification:

- The 2310.017–3750.017 s combined replay starts earlier, at x=77.13. All 60
  originals survive eight reloads; Amberguard returns to (14.84,-2.83),
  still walking. Its last fifteen minutes stay within 22.406 m of home.
  `build/blockwalker-navigation-population-hour7/`.
- The opt-in `test/fixtures/blockwalker-navigation.c` places the walker on
  either side of home. After 300 s and two reloads per side, the new program
  is 15.710/17.679 m from home, minimum up 0.98053/0.98764, with over 100
  independently counted airborne/support steps on every leg. The old program
  fails the west trial at 77.293 m. `build/blockwalker-navigation-regression-home.log`.
- The uninterrupted seed-42 hour keeps all originals alive. Amberguard has
  4428 supported airborne placements, 1122 in the final quarter, minimum up
  0.97910 and no resets/replants. Sidelight and Marrowstep also keep walking:
  241/4717 placements, 60/1164 in the final quarter. Independent corner/contact
  evidence: `build/blockwalker-continuous-population-fresh42/summary.json`.
- Both fresh shore starts pass 900 s and four reloads, minimum up 0.97768/
  0.97969. `build/blockwalker-amber-steering-shores/`.
- The complete current catalog passes 60,000 in-Wasm calls, a paused-controller
  case and five runaway checks: `build/blockwalker-final-controller.log`.

Limit: the very late 3210 s save is not recovered. Its outer feet are already
at the cliff; turning expands the footprint over the edge. That trial falls
into the water and becomes stuck (minimum up 0.09263), despite no removal.
`build/blockwalker-amber-edge-navigation/` is a failed recovery, not a pass.

Remaining: packaged browser verification. The hour also exposes separate
[freight/supply stalls](../20260924-144000-codex-01/TASK.md).
