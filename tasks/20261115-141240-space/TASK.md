# Voxel Flyover 7: Space no longer gives extra speed

- STATUS: CLOSED
- PRIORITY: 210
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`. Owner (2026-11-15, 23:30, after playing the build): "This is awesome. Absolutely great. Only comment I have is that some roofs are hollow from the side, which looks incredibly weird. Also, I want the beams that are collected to be a bit more interesting (sometimes they arent even possible to catch), and they should give a speed boost. Remove space as \"extra speed\". I want to be able to fly higher. The help text when taking control should disappear after a while. Also, I think the sunrise/sunset could be made a lot cooler."

Done when: the Space binding is gone from the game, its help text and its manual.

## Closed (2026-11-16, 00:20)

Space no longer gives speed: the binding is gone from the game, the keys' text and the manual (`Dollyfile-voxel-flyover`); the push of speed comes from beacons. Verified in the image of `d6993c1b2` (2026-11-16, 00:15): the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.6 a second, GPU 6.7 ms, median 17.0 ms, p99 20.1; 57.7, GPU 7.2 ms) and on the integrated AMD GPU (29.5, median 33.3 ms; 29.8 in Chrome, median 33.2, p99 37.2; its first run in Chrome there failed an assertion that the log did not keep, the second passed); sudden changes over the fixed flight: 17 tiles in 14 frames, none over two at once.
