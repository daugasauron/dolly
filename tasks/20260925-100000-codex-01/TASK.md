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
