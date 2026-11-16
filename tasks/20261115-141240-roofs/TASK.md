# Voxel Flyover 7: no roof is hollow from the side

- STATUS: CLOSED
- PRIORITY: 210
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`. Owner (2026-11-15, 23:30, after playing the build): "This is awesome. Absolutely great. Only comment I have is that some roofs are hollow from the side, which looks incredibly weird. Also, I want the beams that are collected to be a bit more interesting (sometimes they arent even possible to catch), and they should give a speed boost. Remove space as \"extra speed\". I want to be able to fly higher. The help text when taking control should disappear after a while. Also, I think the sunrise/sunset could be made a lot cooler."

Done when: no roof of any kind of town shows an opening from any side (gables and ends closed); towns of every kind looked at from the side at near, middle and far zoom.

## Closed (2026-11-16, 00:20)

A wall's top has a point at its middle and goes up to the roof over it, so a gable's end is wall: no roof shows an opening. Looked at from close beside a gabled town and a village of steep turf roofs (`kind.sh` at 150 units), and on approaches from 330 to 900 units for the other kinds. Verified in the image of `d6993c1b2` (2026-11-16, 00:15): the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.6 a second, GPU 6.7 ms, median 17.0 ms, p99 20.1; 57.7, GPU 7.2 ms) and on the integrated AMD GPU (29.5, median 33.3 ms; 29.8 in Chrome, median 33.2, p99 37.2; its first run in Chrome there failed an assertion that the log did not keep, the second passed); sudden changes over the fixed flight: 17 tiles in 14 frames, none over two at once.
