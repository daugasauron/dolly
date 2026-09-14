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
