# Bound warehouse route planning in crowded worlds

- STATUS: CLOSED
- PRIORITY: 280
- TAGS: game,bug,performance


The 3000 s crowded-world continuation with a salvage boat stops the West
warehouse forklift (78) at 3154.600 s: controller execution budget exceeded
while routing home after its fourth stored load. All objects remain physical;
no controller budget increase is justified. Exact failed world and log:
`build/blockwalker-compound-regressions-chrome-salvage-shore-populated/salvage/`.

Its breadth-first search expands four nodes per callback, repeatedly filtering
terrain and evaluating the same overlap for each edge. The unbundled candidate
precomputes observations once, caches each node/edge overlap, expands two nodes,
and spreads eight pickup approaches over callbacks. Geometry, forces, budgets
and guards remain unchanged. Reproduce the original failure, resume the exact
saved population with only the warehouse programs changed, then verify further
storage and the salvage handoff. Keep evidence here before closing.

The optimized clearance predicates match the prior program at 47,068 positions
using two recorded physical sensor frames, including changing the reserved
cargo after building the observation cache. This checks the cached geometry,
not the spelling of the source. `build/blockwalker-salvage/warehouse-clearance-
proof.json` and its replay script preserve the comparison. Full-world replay
remains required; fixed-pose calls from the post-interruption memory did not
repeat the original execution failure.

Resuming the exact failed population with only the two warehouse programs
updated/restarted completes 600 simulated seconds with no controller errors or
deaths; all 135 original objects/programs except those two are preserved, and
the world reaches 143 objects/50 deliveries. West returns home, picks the next
heavy load (132) and is routing it to storage. The fifth completed store and
packaged verification remain. Evidence: `build/blockwalker-compound-regressions-
chrome-salvage-warehouse-resumed/salvage/`.

The subsequent population reaches 4076.15 s without controller errors and West
completes its fifth store, then returns home. This run stops separately when
the unbundled boat rolls beside another vessel; it does not invalidate the
warehouse observation, but the overall world is not a completion pass.
`build/blockwalker-compound-regressions-chrome-salvage-return-route/salvage/`.

The successful safe-clearance continuation subsequently reaches 4354.6 s with
both warehouses at five stores and no controller errors. All 143 prior objects
remain, 149 total. `build/blockwalker-compound-regressions-chrome-salvage-safe-
clearance/`. Fresh-world and exact chassis-recovery continuations also retain
both bounded programs without execution failures.

Verified in packaged image 36 on September 25, 2026. Chrome and Firefox match
all 94 bundled blueprints/programs and restore the 125-object format-2 world,
the original 51-object format-1 world (retaining its sixteen historic deaths),
and the 125-object format-5 continuation without new errors or deaths.
Evidence: `build/blockwalker-image36-preview{,-firefox}/proof.json`.
Snapshot SHA-256:
`aaa757c571d6f3234e0a52570f9ecc7d9f2c50f0a66f3349e08e75af3cc45c38`.
All six protected files, twelve other images and thirteen catalog entries pass
`build/blockwalker-image36-preservation.json`. No public deployment was made.
