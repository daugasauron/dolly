# Voxel Flyover 7: city variety: kinds of houses and of towns, by place

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4` (the game's task, with how it is measured). Brief: `work/briefs-2026-11-15/flyover7.md`. Branch `feature/flyover-4`.

Owner (2026-11-15 19:40): "Also more variation in the cities, different houses, city types etc."

Owner (2026-11-15, 21:30, by the integrator): "Take inspiration from the real world and different cultures when creating objects, also feel free to add fantasy like environments as well." So settlements and objects are recognisably of different places and cultures (stilt houses over water, terraced hill villages, adobe and mud-brick desert towns, timber-frame and stave buildings, pagoda roofs, domes and minarets, windmills, lighthouses, gates, terraced fields), each respectful and original, never a copy of a real building or of a game's art; and a few fantasy environments, rare and memorable (floating islands, crystal fields, giant glowing mushrooms, arches of stone, a bioluminescent shore at night), placed where they fit and blended in. The fantasy environments have their own task once started. Overlaps `tasks/20261115-121944-research-08` (settlements by climate and culture).

Done when: several kinds of town chosen by place (villages, harbour towns, hill towns, towers, others), with different houses; each reads as its kind from afar and close up; stills of each kind; frame times hold.

## Closed (2026-11-16, 00:20)

Eight kinds of town by climate, ground and culture, each with its tower among the landmarks; terraced fields; stilt villages. Left for later, not done: layouts of their own for each kind (all are on the grid of lots). Verified in the image of `d6993c1b2` (2026-11-16, 00:15): the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.6 a second, GPU 6.7 ms, median 17.0 ms, p99 20.1; 57.7, GPU 7.2 ms) and on the integrated AMD GPU (29.5, median 33.3 ms; 29.8 in Chrome, median 33.2, p99 37.2; its first run in Chrome there failed an assertion that the log did not keep, the second passed); sudden changes over the fixed flight: 17 tiles in 14 frames, none over two at once.
