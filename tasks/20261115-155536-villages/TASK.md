# Voxel Flyover 7: villages off the grid, fireworks over towns at night, high cloud

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`. The brief (`work/briefs-2026-11-15/flyover7.md`, points 5 and 6): city variety, and to keep going toward a world that is striking and not repetitive. Research steps 7 (high cloud) and 10 (the sea) are worked here too.

Done when: each is in the game, looked at in stills, measured on both adapters, and the image's test passes with it.

- Villages off the grid: a house that is not a city's tower stands off its lot's middle (to 14 % of the lot) and is turned by its own angle (to 34 degrees either way), in `city.gdshader`.
- Fireworks over towns at night (`fireworks.gdshader`): a grid of cells of 200 units, 48 sparks each; in three of ten turns of seven seconds a shell bursts over a cell whose point lies in a town. Not on the two weakest levels.
- High cloud in `sky.gdshader`: thin streaks at 2,600 units, across the wind, in patches of kilometres, lit fire and rose by the low sun.
- The sea (`water.gdshader`): a swell on deep water, white horses on its crests in a gust, the sea's colour by its country's climate, light on the bed of the shallows.
- Found by the AMD run: `visible_instance_count` was set negative on the weakest level (26 lots under the near 33), an error printed each time the level changed; now 0.

## Closed (2026-11-16, 01:12)

In the image built at 01:03 the game's test passes: Chrome 156 on the NVIDIA card 59.5 a second (GPU 7.0 ms, median 16.8, p99 20.4), Firefox 159 57.0 (GPU 7.2 ms); on the AMD GPU Firefox 29.8 (median 33.1 ms, p99 39.3) and Chrome 29.0 (34.2, 39.1). Sudden changes over the fixed flight: 18 tiles in 15 frames (17 in 14 before). Commit b8dea9b14.
