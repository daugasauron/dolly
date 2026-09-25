# Recover warehouse cargo resting on the chassis

- STATUS: CLOSED
- PRIORITY: 260
- TAGS: game,bug,content


Fresh 1200 s world retains 119 objects and records 25 deliveries with no errors,
crew contacts or truck tipping. Both slingers restock/fire (East 7, West 5),
and the boat completes a recovery/handoff. East warehouse remains at zero:
heavy pallet 95 rests against forklift 77's rear ballast, with its magnet off.
The program excludes physically carried cargo and waits in seek forever.
Exact reproduction: `build/blockwalker-compound-regressions-chrome-salvage-
fresh-slew/salvage/blockwalker-world.json` (t=1200).

The candidate detects an ungripped load resting on its own chassis during seek,
drives slowly away from the cargo while holding its heading and retracting the
lift, then waits for it to settle before normal pickup. It uses ordinary wheel
keys and observations; no object movement, force or lifecycle exception exists.
Resume the exact save with only warehouse programs 77/78 updated; prove the
pallet leaves the chassis, is picked normally, and is stored. Keep all cargo,
other programs and poses. Run `warehouse-shed.c` with `warehouse-shed-updates.json`
via the combined browser harness. Do not close before verification/packaging.

The exact-save 300 s continuation passes with only warehouse 77/78 programs
updated. Pallet 95 leaves the chassis, is magnetically picked up, and is stored
unheld at (174.114,4.485,34.440); East completes its first store at 1314 s. All
119 original objects/other programs remain; world reaches 125 objects and 31
deliveries, no errors/deaths/crew contacts/truck tipping. Both warehouses have
stored at least one load. Evidence: `build/blockwalker-compound-regressions-
chrome-salvage-warehouse-shed/salvage/`. Packaging verification remains.

Verified in packaged image 36 on September 25, 2026. Chrome and Firefox match
all 94 bundled blueprints/programs and restore the 125-object format-2 world,
the original 51-object format-1 world (retaining its sixteen historic deaths),
and the 125-object format-5 continuation without new errors or deaths.
Evidence: `build/blockwalker-image36-preview{,-firefox}/proof.json`.
Snapshot SHA-256:
`aaa757c571d6f3234e0a52570f9ecc7d9f2c50f0a66f3349e08e75af3cc45c38`.
All six protected files, twelve other images and thirteen catalog entries pass
`build/blockwalker-image36-preservation.json`. No public deployment was made.
