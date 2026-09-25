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

Paired Firefox timing with image 31's SIMD library gives 26.288/26.274 s for
the existing engine and 19.282/19.144 s for compounds over 1800 ticks of the
same 125-object world (about 27% less simulation time). Both repeats retain all
objects with zero controller/browser errors. This is a CPU replay, not FPS;
`build/blockwalker-compound-paired-firefox-simd/proof.json`. The engine overlay
used for this measurement has SHA-256
`8ebcc7099dd5071e748d237bfb8b4b4b85cdaaffdd88c78dbfd78ffffaf429`.

Legacy save conversion preserves six active magnet contact points within
0.000000043 m; version-4 reopen stays within 0.000000084 m. Maximum reopened
block-position error is 0.000010491 m. Models (including the explicit default
size=1), sources and memory are unchanged. Evidence:
`build/blockwalker-compound-chrome-raft/preservation.json`.
Full actuator/bearing checks, long interactions and rendered performance remain.

The expanded Chrome mechanics run passes the existing character checks after
adapting obsolete per-body assumptions, plus shape-specific contact attribution
and every bearing size (1x1 through 4x4) on all three axes. Fixed assemblies
transfer the correct total weight through only the contacting lower block.
The 3x3 bearing trials stay within 0.000147 m separation over eight seconds.
An old-world open creates a verified original-JSON backup before version-4
conversion, then import/save/reopen retains all 125 objects and six attachments.
A further 1800 ticks complete without errors. Evidence:
`build/blockwalker-compound-chrome-mechanics/`. Still an unbundled prototype.

A same-browser Firefox baseline/candidate/baseline rendered comparison of the
125-object save measures 29.77 / 52.15 / 30.77 warm FPS. Each phase includes
30 s warmup and three 20 s views; all objects remain, simulation stays near
real time and no browser/controller/model-request errors occur. Screenshots
show the retained world. `build/blockwalker-compound-render-firefox-simd/`.
This is a substantial measured improvement; long fresh gameplay remains required
before replacing the served engine.

Firefox passes the expanded mechanics fixture too, including two reversed 3x3
mounts, controls attached to the stationary underside, and an articulated arm
physically stopped by its own chassis. The latter reports 312.45 N contact,
angle -0.730 rad and 0.002785 m separation; connected compound bodies do not
silently lose all collisions. The 1800-tick replay and six-attachment preservation
pass again. `build/blockwalker-compound-firefox-mechanics/`. The full fresh
900 s recovery-world workload is now running with unchanged catalog programs.
