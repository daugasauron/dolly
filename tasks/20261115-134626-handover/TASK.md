# Voxel Flyover 7: the clouds change at once when the sun hands over to the moon

- STATUS: OPEN
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`.

Found 2026-11-15 by the sudden changes over the fixed flight (60 s by itself from 09:00 at a fixed 60 steps a second, every frame shrunk to 120 by 67): one frame, 46.5 s in, in which 29 of 144 tiles change at once. The frames around it differ in every low cloud and in the high cloud layer.

Cause: the light is the sun's until the sun is 0.06 under the horizon and the moon's after; the low clouds' lit side and the high layer's bright side follow the light's direction, which turns round in that frame.

Done when: no frame of the fixed flight changes more than four tiles at once.

## State (2026-11-15, 23:00)

Fixed in the game: what the light's side lights fades to nothing at the handover and back (`handover`, told to every shader). The fixed flight: 16 tiles in 10 frames, none over four at once (45 in 11 before, 29 of them in that frame). What is seen through (rain's curtains, clouds, mist, rain) also has a fixed drawing order now. Left: the image's test.
