# Voxel Flyover 7: city variety: kinds of houses and of towns, by place

- STATUS: OPEN
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4` (the game's task, with how it is measured). Brief: `work/briefs-2026-11-15/flyover7.md`. Branch `feature/flyover-4`.

Owner (2026-11-15 19:40): "Also more variation in the cities, different houses, city types etc."

Owner (2026-11-15, 21:30, by the integrator): "Take inspiration from the real world and different cultures when creating objects, also feel free to add fantasy like environments as well." So settlements and objects are recognisably of different places and cultures (stilt houses over water, terraced hill villages, adobe and mud-brick desert towns, timber-frame and stave buildings, pagoda roofs, domes and minarets, windmills, lighthouses, gates, terraced fields), each respectful and original, never a copy of a real building or of a game's art; and a few fantasy environments, rare and memorable (floating islands, crystal fields, giant glowing mushrooms, arches of stone, a bioluminescent shore at night), placed where they fit and blended in. The fantasy environments have their own task once started. Overlaps `tasks/20261115-121944-research-08` (settlements by climate and culture).

Done when: several kinds of town chosen by place (villages, harbour towns, hill towns, towers, others), with different houses; each reads as its kind from afar and close up; stills of each kind; frame times hold.

## State (2026-11-15, 23:20)

In the game's code: eight kinds of town by place (`town_kind`: the climate, the ground and a culture field of 5.1 thousand units; `stilts_at`): a city of towers on blocks between asphalt avenues (where the culture field is high); a town of gabled timber-frame houses under red tiles; a desert town of mud-brick cubes, some under whitewashed domes; a village of dark timber under steep turf roofs in the cold; a town of walls between red posts under wide grey-green roofs with upturned eaves; a village of thatched houses on posts over the shallows off a settled warm wet coast; a whitewashed town with blue domes on warm coasts; round-roofed thatched huts on the savanna. One mesh for all (four walls and a roof of 4 by 4 squares, 2 by 2 beyond 33 lots) that the vertex stage shapes; houses of 3 to 5 storeys in towns, 2 or 3 in villages, 1 or 2 on posts, a city's towers 4 to 20; more open lots, earth yards and earth roads outside cities. Each kind has its tower among the landmarks (`tasks/20261115-*-landmarks`). Farmed land that is warm, wet and sloping is terraced along its contours, flooded in spring, green in summer, gold in autumn; few trees stand on farmed land. The flight's twin knows the kinds. Looked at: each kind on an approach (`kind.sh`), the stilt village and the terraces (`at.sh`). Left: the kinds' own layouts (all are on the grid of lots), the image's test, the numbers, a take.
