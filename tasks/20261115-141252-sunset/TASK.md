# Voxel Flyover 7: a much more striking sunrise and sunset

- STATUS: CLOSED
- PRIORITY: 210
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`. Owner (2026-11-15, 23:30, after playing the build): "This is awesome. Absolutely great. Only comment I have is that some roofs are hollow from the side, which looks incredibly weird. Also, I want the beams that are collected to be a bit more interesting (sometimes they arent even possible to catch), and they should give a speed boost. Remove space as \"extra speed\". I want to be able to fly higher. The help text when taking control should disappear after a while. Also, I think the sunrise/sunset could be made a lot cooler."

Done when: sky colours and scattering, the sun's glow, clouds lit from below, long light and shadow across the land and water glinting at sunrise and sunset; smooth and stable in time (the sudden changes over a flight through sunset), cheap on the AMD path (its 30 a second); stills through a sunset and a sunrise.

## Closed (2026-11-16, 00:20)

The sky at sunrise and sunset is in bands: fire at the horizon on the sun's side, rose over it, violet higher, and opposite the sun the earth's blue-grey shadow under a rose band; the sun's disc is larger when it is low, with a stronger glow and a band of light along the horizon; the high clouds are lit from below, fire toward the sun and rose away from it, violet in their shadow, and the low clouds likewise; the sun's light on the land comes on sooner (full at 0.12 of its height instead of 0.2), for the long light and shadows. Looked at in a sunset over a coast. All of it is the sky's and the clouds' existing passes: on the AMD GPU the frame is as before. Verified in the image of `d6993c1b2` (2026-11-16, 00:15): the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.6 a second, GPU 6.7 ms, median 17.0 ms, p99 20.1; 57.7, GPU 7.2 ms) and on the integrated AMD GPU (29.5, median 33.3 ms; 29.8 in Chrome, median 33.2, p99 37.2; its first run in Chrome there failed an assertion that the log did not keep, the second passed); sudden changes over the fixed flight: 17 tiles in 14 frames, none over two at once.
