# Voxel Flyover 7: towns visible from afar, without popping up near by

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4` (the game's task, with how it is measured). Brief: `work/briefs-2026-11-15/flyover7.md`. Branch `feature/flyover-4`.

Owner (2026-11-15 19:40): "Houses shouldn't appear when you get close, they need to be visible (but rendered in lower quality?) from a distance, now from far away you just see the roads and then suddenly a city pops up."

Now: the buildings are a grid of 66 by 66 lots around the flyer and rise out of the ground between 520 and 400 units away; the land paints the town's roads from any distance.

Done when: a town shows its buildings from as far as its roads show, in a cheaper form at distance, and becomes the full town on approach without a visible switch; nothing pops in or out at any distance (stills at several distances on one approach, and the sudden changes over a flight toward a town); the frame times on both adapters hold (NVIDIA 60 and 59, AMD 30).

## Closed (2026-11-15, 22:45)

A town's buildings are drawn to 100 lots (1,600 units) each way, the same lots the same buildings at every distance, standing lower the further they are between 0.6 and 0.97 of the reach; the lots beyond 33 have a mesh with a plainer roof, whose shape the near roofs take before they meet. A weak adapter draws to 72, 52, 40, 33 or 26 lots by its level. Looked at on approaches from 1,500 and 900 units. Verified in the image of `a81fb3764`: the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.9 a second, GPU 6.4 ms, median 16.8 ms, p99 19.6, max 24.3; 58.7, GPU 6.6 ms) and on the integrated AMD GPU (30.0, median 33.1 ms, p99 36.9; 29.6 in Chrome); take `work/videos-2026-11-15/voxel-flyover-7/take1.mp4` (of the same commit).
