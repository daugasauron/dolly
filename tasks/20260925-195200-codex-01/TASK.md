# Abandon an airborne pickup that stays blocked by traffic

- STATUS: OPEN
- PRIORITY: 240
- TAGS: game,content,bug

The fresh competition-v5 West courier60 completes three deliveries, then stays in pickup for cargo104 from787.117s through1500s. Parcel104 is on the ground at(-77.056,0.485,-24.689); aircraft60 hovers at7.532m, magnet powered but unattached. Its traffic clearance overrides pickup altitude while the nearby mine porter remains in the approach. Add a bounded, observable retry/alternate job policy using ordinary controls. Preserve the successful bounded descent controller. Verify recovery in this exact populated save, without moving cargo or other machines.

Evidence: `build/blockwalker-compound-regressions-chrome-competition-v5/salvage/`
contains the exact final world, full trace and component proof. Kept separate
from the stable checkpoint requested by the user; no further feature work here.
