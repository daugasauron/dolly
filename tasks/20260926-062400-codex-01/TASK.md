# Let controllers inspect nearby collision shapes

- STATUS: OPEN
- PRIORITY: 270
- TAGS: game,physics,agents

The ammunition tender's900s navigation snapshot exhausts223 nodes in a pocket
bounded by crane/loader circles. Reachable coordinates span x58.739..90.239 and
z3.300..24.300, while the pickup approach is at(54.222,53.475). Removing the
dead-end fallback does not produce a reload in a paired360s physical run.

Current nearby sensors provide one horizontal radius and vertical range for an
entire articulated machine. These cannot distinguish raised arms from its base.
Investigate a read-only `s.bounds(id)` query for actual collision-shape AABBs,
restricted to the existing48m observation radius. Geometry must come from Box3D,
including articulated parts and broad turntable mounts, without actor-specific
navigation rules. Keep allocations off existing controllers' paths when unused.

Prototype: `build/blockwalker-collision-sensors/world.c`; unbundled.
Static planner evidence: `build/blockwalker-battery-supply/route-900-space.json`.
Before completion, verify query bounds/range/error behavior inside Dolly, prove
physical navigation/reloading improves without collisions/losses/controller
errors, measure populated performance, and verify rendering/save compatibility.

First in-Dolly query fixture passes at the original900s saved state:20 observable
objects return their actual Box3D shape bounds,108 outside48m return empty, six
invalid IDs are rejected, and an unknown ID returns empty. No physics step or
state mutation is needed. Evidence: `...-chrome-collision-bounds/salvage/`.
Measured ground-level bounds of gun106 are x58.495..64.505/z27.495..32.505;
the old navigation radius including tender clearance is12.278m around(61,30).
That difference motivates testing a route through the actual clear space.

The next query revision adds the shape's rigid-body owner index so programs can
group low shapes without treating a raised arm as ground obstruction. Candidate
`recovery-shapes.js` queries one structure per update, caches for0.5s and retains
the broad exclusion around actively loaded friendly machinery. A physical replay
is still required; this is not yet a navigation or performance pass.

The body-owner revision also passes its real in-Dolly query checks. Its exact900s
static sensor replay finds a14-point route through the machinery after34 node
expansions/1.7s of controller updates; the broad-circle search exhausted223 nodes.
Evidence: `...-chrome-collision-bounds-body/salvage/geometry.json` and
`build/blockwalker-collision-sensors/route-900-space.json`. The paired physical
replay is now running as `battery-shape-route`; no movement result yet.

Completed paired900→1260s trial: both branches retain130 objects,2 jobs and4 shots,
with zero new reload cycles/errors/losses/deaths/friendly impacts. The shape-query
candidate physically crosses the machinery gap, reaching(61.487,45.669) from
(73.739,19.800); minimum up0.999995. This proves movement, not resupply. Full trace:
`...-chrome-battery-shape-route/salvage/`. A follow-up paired1260→1800s run changes
only tender steering/lookahead; its inputs remain frozen under
`build/blockwalker-collision-sensors/{follow-catalog.json,follow-replay.c}`.

The1260→1800s follow-up also completes, raw1, with138 objects in both branches.
Candidate tender jobs increase2→4; baseline remains2. Both still have4 gun shots
and zero new full reload/fire cycles. Minimum up0.999995 candidate/0.999993
baseline, zero friendly impacts/controller errors/missing actors/deaths. Both
final saves and the14MB full trace are retained under
`...-chrome-battery-shape-follow/salvage/`. Do not bundle this as a completed
sustained-supply fix. The query/controller performance and browser checks remain.
