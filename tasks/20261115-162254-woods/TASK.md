# Voxel Flyover 7: woods and glades, palms, cypresses and birches, four more landmarks

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`. The brief (`work/briefs-2026-11-15/flyover7.md`, points 4 to 6) and the owner's "take inspiration from the real world and different cultures": more kinds of thing in the world, each by its place. Research step 13 (forest structure) is worked here.

Done when: each is in the game, looked at in stills, measured on both adapters, and the image's test passes with it.

- Woods and glades (`woods` in `flora.gdshaderinc`): the share of plots with a tree is 0.12 to 1.3 of what it was, in patches some 60 units across cut from the climate's two fields (which the ground's texture holds: no noise call for a tree). Not in the desert or the savanna.
- Tree kinds by the same shaped mesh (`trees.gdshader`): palms (hot, under 14 units over the sea), cypresses (warm and dry, a part of the trees), birches (the belt next to the firs).
- Landmarks (`terrain.gd`'s `landmark`, `landmarks.gd`): a wreck on a shore, a keep with a fallen ring of wall on a hill, a stepped mound in the hot wet lands, a tree far older than its wood. Forms of kinds found in many places; none copies a building.
- The night sky: a river of stars (a band of faint light with lanes and finer stars), `sky.gdshader`.
- Sounds made before the flight: rain's patter by the rain over the camera (not snow), the sea's wash by how low the flight is over it (`murmur` in `main.gd`). **Not heard by anyone yet**: their levels are computed (about the drone's), their sound is for the owner to judge.

## Closed (2026-11-16, 01:42)

In the image built at 01:33 the game's test passes: Chrome 156 on the NVIDIA card 59.5 a second (GPU 7.0 ms, median 16.9, p99 20.6), Firefox 159 57.5 (GPU 7.3 ms); on the AMD GPU Firefox 29.4 (median 33.7 ms, p99 38.7) and Chrome 29.8 (33.2, 37.5) on its second run: the first failed an assertion whose text the script did not keep (it keeps each test's whole output from now on). Sudden changes over the fixed flight: 18 tiles in 15 frames, as before. The sounds are still unheard.
