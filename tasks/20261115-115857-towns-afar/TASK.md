# Voxel Flyover 7: towns visible from afar, without popping up near by

- STATUS: OPEN
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4` (the game's task, with how it is measured). Brief: `work/briefs-2026-11-15/flyover7.md`. Branch `feature/flyover-4`.

Owner (2026-11-15 19:40): "Houses shouldn't appear when you get close, they need to be visible (but rendered in lower quality?) from a distance, now from far away you just see the roads and then suddenly a city pops up."

Now: the buildings are a grid of 66 by 66 lots around the flyer and rise out of the ground between 520 and 400 units away; the land paints the town's roads from any distance.

Done when: a town shows its buildings from as far as its roads show, in a cheaper form at distance, and becomes the full town on approach without a visible switch; nothing pops in or out at any distance (stills at several distances on one approach, and the sudden changes over a flight toward a town); the frame times on both adapters hold (NVIDIA 60 and 59, AMD 30).

## State (2026-11-15, 21:40)

Done in the game's code: the buildings' grid reaches 100 lots (1,600 units) each way instead of 33 (528), in rings so that a weak adapter draws the nearer ones (72, 52, 40, 33 lots by level), and reads the ground's two coarser textures. A building stands lower the further it is between 0.6 and 0.97 of the reach, so a town rises out of the haze by degrees; the same lots are the same buildings at every distance, so there is no switch. Looked at on an approach from 1,500 units (`approach.py`), six stills 6 s apart: the skyline shows from the first. Cost, back to back while another program drew on the card: GPU 6.7 ms a frame against 6.1; on the AMD GPU 30.0 a second, median 33.2 ms, p99 36.7 (its level draws 33 lots as before). Left: the image's test, the sudden changes over an approach, a look in a take.
