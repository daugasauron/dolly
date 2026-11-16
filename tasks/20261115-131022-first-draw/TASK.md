# Voxel Flyover 7: a frame of 160 ms when a thermal is first drawn

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`.

Found 2026-11-15 by the probe's frame times: one frame of 160 to 220 ms some 12 s into the flight from the start (and at 4 s in version 6), in every run, in Chrome and Firefox on both adapters (the test's "max").

Cause: a thermal's column is first drawn when a plot with a town comes within 360 units, and its pipeline is made in that frame (with the thermals left out the frame is not long). A lighthouse's beam and the rain would do the same.

Done when: no frame over 60 ms after the first second of a flight of 60 s.

## Closed (2026-11-15, 22:45)

`warm_up` draws the thermal's and the lighthouse beam's materials once at the start, in a card under the board, and the rain is drawn empty for the first three seconds. The longest frame of the game's test was 222 ms in Chrome and 208 on the AMD GPU before; after, 24.3 in Chrome, 62.6 in Firefox, 55.8 and 40.3 on the AMD GPU. Verified in the image of `a81fb3764`: the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.9 a second, GPU 6.4 ms, median 16.8 ms, p99 19.6, max 24.3; 58.7, GPU 6.6 ms) and on the integrated AMD GPU (30.0, median 33.1 ms, p99 36.9; 29.6 in Chrome); take `work/videos-2026-11-15/voxel-flyover-7/take1.mp4` (of the same commit).
