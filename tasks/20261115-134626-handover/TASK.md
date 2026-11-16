# Voxel Flyover 7: the clouds change at once when the sun hands over to the moon

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`.

Found 2026-11-15 by the sudden changes over the fixed flight (60 s by itself from 09:00 at a fixed 60 steps a second, every frame shrunk to 120 by 67): one frame, 46.5 s in, in which 29 of 144 tiles change at once. The frames around it differ in every low cloud and in the high cloud layer.

Cause: the light is the sun's until the sun is 0.06 under the horizon and the moon's after; the low clouds' lit side and the high layer's bright side follow the light's direction, which turns round in that frame.

Done when: no frame of the fixed flight changes more than four tiles at once.

## Closed (2026-11-16, 00:20)

What the light's side lights fades through the handover from sun to moon. The fixed flight has no frame that changes more than four tiles at once. Verified in the image of `d6993c1b2` (2026-11-16, 00:15): the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.6 a second, GPU 6.7 ms, median 17.0 ms, p99 20.1; 57.7, GPU 7.2 ms) and on the integrated AMD GPU (29.5, median 33.3 ms; 29.8 in Chrome, median 33.2, p99 37.2; its first run in Chrome there failed an assertion that the log did not keep, the second passed); sudden changes over the fixed flight: 17 tiles in 14 frames, none over two at once.
