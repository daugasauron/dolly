# Diagnose the yard porter tipping after its carousel deliveries

- STATUS: OPEN
- PRIORITY: 230
- TAGS: game,content,bug

The fresh competition-v5 porter38 completes six deliveries, including all three carousel parcels, then ends tipped near(-15.935,1.350,42.532), trying to pick up41. The carousel obstruction is fixed; this later incident has a different location and needs contact/terrain evidence before changing the controller. Preserve all actors and the working carousel chain. Confirm the cause and test a generic wheel-control or route correction; do not grant hidden righting forces.

Evidence: `build/blockwalker-compound-regressions-chrome-competition-v5/salvage/`
contains the exact final world, full trace and component proof. Kept separate
from the stable checkpoint requested by the user; no further feature work here.
