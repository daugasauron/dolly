# Verify larger survey, walking and submerged cargo machines

- STATUS: OPEN
- PRIORITY: 200
- TAGS: game,agent,physics

Replay Pi's unchanged Obsidian Kite (49 parts), Amberback (43 parts) and
Underpass (66 parts) with the existing 42-object catalog. Measure a complete
basin flight/landing circuit, sustained contact-aware walking, and an actual
magnetic pickup from underwater followed by delivery/release onto a tray.
Keep the original live creations and full Pi history. Bundle only verified
designs, preserving all older catalog entries and placements.

The 330-second guarded fresh replay is `build/blockwalker-expedition-browser.mjs`.
It loads the actual Pi blueprints/controllers and separate cargo into Dolly,
records poses/magnet states and timed GPU captures, with no agent HTTP requests.

Live Amberback 53 remained within 0.8 mm between ages 1313.5 and 1604.1 seconds;
its controller stayed in lift phase 0 since age 253.03 seconds. It is alive but
stalled. This finding was sent to the actual Astra/xhigh Pi to diagnose and test
an improved copy while preserving the original. Do not bundle the stalled
controller based only on a short successful practice trial.

## Fresh replay, 06:46 JST

All 46 objects/1,254 parts survived 330.017 simulation seconds. This instrumented
replay saved full poses twice per second and took 466.0 wall seconds; it does not
measure ordinary rendering FPS. Evidence: `build/blockwalker-expedition/`,
`proof.json`, seven timed GPU images and matching browser/analysis logs.

Obsidian Kite completed four basin circuits with actual takeoff/return/landing
poses, 21.72 m maximum excursion, maximum height 14.55 m and minimum up=0.99999.
Its four hydraulic landing mechanisms travel 0.700 m. Underpass attached only
to the separate cargo, raised it from -4.03 to 1.38 m while carrying it 1.013 m
horizontally, then switched off and withdrew. Maximum recorded load was 17.21 N.
The crate rests at y=0.4243 on the tray centered at y=-0.5454; it moved less than
0.1 mm during the final 30 seconds. All seven crane phases were observed.

Amberback also passed this fresh seed: both directions, 9.76 m maximum excursion,
325 phase changes, minimum up=0.9906 and all feet lifted then returned to floor.
That does not invalidate the independent long-lived stall. It remains unbundled
until the recovery behavior is verified. Pi has released **Amberstride**, live
ID 57, a 43-part touchdown-watchdog revision; inspect and replay this candidate.
**Longwake**, live ID 56, is an unverified 43-part channel survey boat.

The catalog now adds only Obsidian Kite, Underpass and its crate: **45 objects /
1,211 parts**, with the first 42 entries unchanged. Sources/controllers are the
actual Pi designs. The app rebuilt inside Dolly in 17.0 seconds; the native
checks passed. Fresh-world persistence/integration passed, including magnetic pickup,
release and restored attachments (`build/blockwalker-expedition-integration.log`).
Existing live
objects and history were not migrated or replaced for this data-only update.

Amberstride is still being evaluated; Pi also released **Amberguard**, live ID 58,
a bounded sequential-replant controller. The original stalled Amberback remains
in the live world. This issue stays open for verification of the recovery design.

## Recovery and service-machine replay, 08:52 JST

The new guarded 360 s replay kept all **51 objects/1431 parts** alive. It took
482.76 wall seconds while saving detailed state once per simulated second;
this is an instrumented verification run, not ordinary rendering performance.
`build/blockwalker-recovery/` contains the full trace, eight GPU images and proof.

Longwake completed two full five-leg routes, traversing z=-120..-59.21 and
x=-118.26..-108.89, minimum up=0.997988, no stall retries. Its maximum sampled
physical-radius estimate was 5.944 m. Lattice completed 20 hydraulic transfer
cycles with zero faults. Its independent crate moved across 4.918 m in X while
remaining within 4 cm of the tray's local center horizontally after the initial
drop; local vertical separation stayed 0.9657..0.9806 m. Tray tilt reached
0.25073 rad. Normal Amberguard completed 272 gait cycles and 16 reversals,
minimum up=0.99461 and z=62.06..73.66. Amberstride also kept moving; retain both
live originals, but the proposed catalog selects Amberguard's tested recovery.

The first fault clone at (18,64) inadvertently straddled the western basin
ledge: terrain height under its root is 2 m and the body extends onto the lower
floor. It took 224.117 s to replant before the deliberate lift interruption was
reached. That run cannot isolate flat-ground recovery and does not prove a
terrain-capable walker. Its actual GPU image and event trace retain the finding.

The separate flat-ground comparison uses the same seed (48) for the unchanged
controller and its existing forced-failure variant, at clear plots (-55,-70)
and (-75,-70). All 47 objects/1297 parts survived 120 s. The injected lift failed
at 4.4 s; its watchdog fired at 7.2 s, sequential replant ran from 9.217 to
12.567 s, and the next completed step was at 13.967 s. It then reached 83 cycles,
five reversals and minimum up=0.994916. The normal copy completed 91 cycles with
no resets. `build/blockwalker-flat-recovery/{flat-recovery,proof}.json` and four
GPU frames provide the evidence; the instrumented run took 195.304 wall seconds.

`build/blockwalker-recovery-catalog.json` prepares **49 objects/1345 parts**:
the original 45 unchanged, plus Longwake, Amberguard, Lattice and its crate at
(-30.92,6.3,-74). This candidate is verified but **not yet bundled**. Batch it
with the next app/image checkpoint rather than interrupting the live biped
experiment solely for a data update. A changed image recipe also changes saved-
session compatibility; preserve the whole live history/world through the normal
verified import workflow when updating that session. The issue stays open until
the catalog package and its fresh-load behavior are verified.
