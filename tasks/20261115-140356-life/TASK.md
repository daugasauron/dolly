# Voxel Flyover 7: life by place: boats, gulls, geese, balloons, whales

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`. Overlaps `tasks/20261115-121944-research-12` (life by place, season and hour).

Owner (2026-11-15 19:40): "The birds are a super nice addition. [...] I want people to feel like they are exploring a world where they can find new things or combinations of things."

Done when: several kinds of life are met by place, season and hour, each a grid whose shader places it (no state), none popping in or out, looked at in stills; frame times hold on both adapters.

## Closed (2026-11-16, 00:20)

Boats, gulls, geese, balloons and whales, each a grid whose shader places its cell's own. Left for later, not done: life on land. Verified in the image of `d6993c1b2` (2026-11-16, 00:15): the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.6 a second, GPU 6.7 ms, median 17.0 ms, p99 20.1; 57.7, GPU 7.2 ms) and on the integrated AMD GPU (29.5, median 33.3 ms; 29.8 in Chrome, median 33.2, p99 37.2; its first run in Chrome there failed an assertion that the log did not keep, the second passed); sudden changes over the fixed flight: 17 tiles in 14 frames, none over two at once.
