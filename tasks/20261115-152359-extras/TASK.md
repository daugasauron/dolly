# Voxel Flyover 7: after the owner's points: herds on the land, gusts in the trees, and what follows

- STATUS: OPEN
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`. The brief (`work/briefs-2026-11-15/flyover7.md`, point 6): keep going until 07:00 toward a world that is smooth, striking and not repetitive.

Done when: each addition listed in the State is in the game, looked at, measured on both adapters, and the image's test passes with it.

## State (2026-11-16, 01:30)

- Herds (`herd.gdshader`): nine animals for a cell of 300 units, in three cells of ten, on open ground: sheep where it is temperate, antelopes where it is warm, reindeer in the cold; each walks a round of its own, legs swinging, and nods to graze. Not on the weakest level. Looked at with every cell filled.
- The gusts bend the trees' crowns along the wind on the two strongest levels (`sways` in `trees.gdshader`).
- Surf: lines of foam roll in over the shallows toward the shore (`water.gdshader`). Looked at over a coast.

Left: the image's test.
