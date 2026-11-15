# Voxel Flyover 7: villages off the grid, fireworks over towns at night, high cloud

- STATUS: OPEN
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`. The brief (`work/briefs-2026-11-15/flyover7.md`, points 5 and 6): city variety, and to keep going toward a world that is striking and not repetitive. Research steps 7 (high cloud) and 10 (the sea) are worked here too.

Done when: each is in the game, looked at in stills, measured on both adapters, and the image's test passes with it.

- Villages off the grid: a house that is not a city's tower stands off its lot's middle (to 14 % of the lot) and is turned by its own angle (to 34 degrees either way), in `city.gdshader`.
- Fireworks over towns at night (`fireworks.gdshader`): a grid of cells of 200 units, 48 sparks each; in three of ten turns of seven seconds a shell bursts over a cell whose point lies in a town. Not on the two weakest levels.
- High cloud in `sky.gdshader`: thin streaks at 2,600 units, across the wind, in patches of kilometres, lit fire and rose by the low sun.
- The sea (`water.gdshader`): a swell on deep water, white horses on its crests in a gust, the sea's colour by its country's climate, light on the bed of the shallows.
- Found by the AMD run: `visible_instance_count` was set negative on the weakest level (26 lots under the near 33), an error printed each time the level changed; now 0.

## State (2026-11-16, 01:15)

All five are in the tree and looked at in stills (a gabled town at night, a coast at midday and dusk, two seas). AMD Firefox with them: 29.7 a second by day and by night (median 33.0 and 33.3 ms). The image's build and test are next.
