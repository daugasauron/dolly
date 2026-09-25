# Represent fixed block assemblies as rigid physics bodies

- STATUS: OPEN
- PRIORITY: 230
- TAGS: game,physics,performance

Every block currently owns a Box3D body, including boxes that are supposed to
form a rigid assembly. Neighbor welds and broad bearing mounts connect them,
but the solver still handles every body and weld, and long structures flex.
The crowded Firefox profile attributes about 7 ms per tick to Box3D; see
[the performance issue](../20260925-010000-codex-01/TASK.md).

Applying the current fixed-edge rules to the 91-design image 29 catalog gives
2271 block bodies but only 351 rigid components, of which 18 contain an anchored
root. This is a topology count, not a measured speedup. Investigate compound
shapes sharing one body per rigid component, retaining separate bodies across
hinges, wheels, turntables and pistons. Keep all shapes and physical material
properties; do not remove content or freeze programs to improve timing.

Block-local poses, actuator frames, magnet poles, water displacement and contact
attribution must remain correct when blocks share a body. Avoid counting a
shared body's mass or contacts once per block. Broad bearing plates stay on the
fixed side, with every touching mount attached to the intended component.

Define how old flexed saves migrate before changing the packaged engine.
Preserve models, programs, memory, cargo links and the physical placement of the
world; account for shared-body momentum and any unavoidable reconciliation of
old weld strain. Verify current/legacy saves, joint controls, pickups, boats,
walkers and slingers in real browsers. Compare the same crowded world in paired
Firefox timing, then run the complete cargo/recovery workload. Compile inside
Dolly and keep the served checkpoint unchanged until the candidate passes.

Prototype plan: construct the same connected components as the existing fixed
mount graph, with a block-local transform and shape ownership for each part.
Keep all collision shapes, their density/friction, broad stationary bearing
plates and articulated joints. Apply thruster force at its actual block center;
use each shape's displacement for water and attribute contacts by shape.

For restoration, reconstruct compound-local shapes from saved block world poses
so old weld strain does not snap the world to blueprint positions. Preserve
linear and angular momentum when combining dynamic parts, and translate saved
magnet attachment points through the referenced block's frame. New saves should
write block poses/velocities and a versioned attachment convention. Reconstruct
joint frames from their original block-local frames. Anchored components remain
static. This approach still needs an implementation and preservation tests;
no speed or stability improvement is claimed yet.

The lab prototype's first Chrome test restores the 125-object, 2327-block legacy
save as 383 bodies, with maximum initial block-position error 0.000002861 m.
All IDs, blueprints, programs, memory and magnet ownership survive version-4
save/reopen. A two-block momentum check, off-center thruster and 2x2 floating
raft pass, as do 60 ticks with no deaths or controller errors. Evidence:
`build/blockwalker-compound-chrome-raft/`; source and fixture are under
`build/blockwalker-compound/`. The earlier thin two-block raft tipped and is
preserved as a failed geometry test. No paired speed or endurance claim yet.
Canonical engine and served image still use individual block bodies.
