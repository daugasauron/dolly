# Voxel Flyover 7: beacons that are more interesting, always catchable, and give a speed boost

- STATUS: CLOSED
- PRIORITY: 210
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`. Owner (2026-11-15, 23:30, after playing the build): "This is awesome. Absolutely great. Only comment I have is that some roofs are hollow from the side, which looks incredibly weird. Also, I want the beams that are collected to be a bit more interesting (sometimes they arent even possible to catch), and they should give a speed boost. Remove space as \"extra speed\". I want to be able to fly higher. The help text when taking control should disappear after a while. Also, I think the sunrise/sunset could be made a lot cooler."

Done when: a beacon is more interesting to see and to catch (motion, a trail, a burst without sound, variety), always catchable (never inside terrain or a building, never out of reach), and catching one gives a speed boost that eases in and out; looked at and flown.

## Closed (2026-11-16, 00:20)

A beacon has one of four colours before it is lit, a gem that turns and bobs at its own pace, and three motes that circle it, faster once it is lit; as it is lit a ring of light bursts out of it for a second and a half. It is lit anywhere along its beam within 11 units of it (before: within 8 units of the gem itself), and its gem floats 18 units clear of the ground, the roofs and the landmarks around it, so every one can be caught; the flight by itself lit 8 in 50 s where it lit 2 or 3. Lighting one gives a push of 26 units a second that comes on in 0.7 s and wears off over six. Looked at in two stills of a beacon being lit. Verified in the image of `d6993c1b2` (2026-11-16, 00:15): the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.6 a second, GPU 6.7 ms, median 17.0 ms, p99 20.1; 57.7, GPU 7.2 ms) and on the integrated AMD GPU (29.5, median 33.3 ms; 29.8 in Chrome, median 33.2, p99 37.2; its first run in Chrome there failed an assertion that the log did not keep, the second passed); sudden changes over the fixed flight: 17 tiles in 14 frames, none over two at once.
