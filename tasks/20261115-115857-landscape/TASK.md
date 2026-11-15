# Voxel Flyover 7: landscape variety with rarity: high mountains, rivers and valleys, oceans with islands

- STATUS: OPEN
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4` (the game's task, with how it is measured). Brief: `work/briefs-2026-11-15/flyover7.md`. Branch `feature/flyover-4`.

Owner (2026-11-15 19:40): "I want more variation in the landscape, with some things that are more rare, like high mountains. Also rivers and valleys, and larger ocean like water with islands."

Done when: rare high mountains above the usual range, snow-capped; rivers that run downhill through valleys to the sea; larger oceans with islands and archipelagos; common things common and rare things rare, by noise at several scales, deterministic and endless, every transition blended; the flight (terrain.gd) agrees with what is drawn; looked at in stills of each, and the frame times and sudden changes hold.

## State (2026-11-15, 22:20)

In the game's code (`terrain.gdshaderinc`, `terrain.gd`): slow fields of the world at 1.9, 2.7, 7.3, 11 and 19 thousand units, each turned and placed by itself (`slow`). Oceans and continents of 7.3 thousand units with lands of 2.7 thousand in them shift the 520-unit coasts, so an ocean has only islands and a continent few seas (a map of 51 km, `map.mjs`: 46 per cent sea, oceans several km across); an ocean's floor is 24 units deeper. The relief of a region makes its ranges 0.3 to 1 of what they were; a massif (the 19 thousand field over 0.72, a tenth of the world, full over 0.83) raises its base by 45 and its peaks to 2.5 times: 394 units on that map, against 174 around the start. Rivers follow a contour of a meandering noise at the sea's level, in valleys 180 units wide, through land under 90 units over the sea, and narrow to nothing in the hills. The climate has countries: warmth shifts by a field of 19 thousand units and moisture by one of 11 thousand. The ground's textures keep heights around 110 so the half floats stay fine on the massifs, and the board's ceiling rises with the ground. The start's surroundings are as they were (the fields' places were chosen so). Looked at: a massif, a river with fields and towns, the open sea with islands (`at.sh`). Far from the start: at 100 thousand and at a million units the picture is whole and three consecutive frames reverse 0.22 of what they move, against 0.19 at the start; no recentring was added (a million units is nine hours of flight). On the AMD GPU 29.9 a second, median 33.2 ms, p99 37.9. Left: a field of 53 thousand units for rare kinds of world (with the fantasy regions), latitude, the image's test and numbers on the NVIDIA card, a take.
