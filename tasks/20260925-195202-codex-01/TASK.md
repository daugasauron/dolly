# Unblock East heavy freight before the warehouse

- STATUS: OPEN
- PRIORITY: 230
- TAGS: game,content,bug

At1500s in fresh competition-v5, heavy parcel99 remains carried by boat55 at about(115.3,0,65). East warehouse77 correctly remains seek: all750 sampled frames contain no delivered heavy cargo within its48m sensing range. West warehouse has completed storage; both programs separately pass the exact loaded-cargo regression. Inspect boat55, its occupied approach and receiving crew to explain the missing East input. Do not move/remove cargo or weaken opponents. Verify actual delivery followed by ordinary storage.

Evidence: `build/blockwalker-compound-regressions-chrome-competition-v5/salvage/`
contains the exact final world, full trace and component proof. Kept separate
from the stable checkpoint requested by the user; no further feature work here.
