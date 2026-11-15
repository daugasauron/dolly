# Voxel Flyover 7: landmarks of many places and a few of fantasy, one a plot, by where they fit

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`.

Owner (2026-11-15, 21:30): "Take inspiration from the real world and different cultures when creating objects, also feel free to add fantasy like environments as well." Overlaps `tasks/20261115-121944-research-09` (horizon landmarks) and `-research-11` (fantasy regions).

Done when: landmarks of several places and cultures and a few fantasy ones stand where they fit, rare enough to be finds, visible from afar without popping, not flown through, each looked at in stills; frame times hold on both adapters.

## Closed (2026-11-16, 00:20)

Landmarks of many places and a few of fantasy, one a plot, by where they fit, the flight looking ahead for them; a realm of wonders where the sea is alight at night. Looked at: lighthouse (day and night), windmill, arch, mushrooms, gate, floating islands, a clock tower, the realm's sea at night. Verified in the image of `d6993c1b2` (2026-11-16, 00:15): the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.6 a second, GPU 6.7 ms, median 17.0 ms, p99 20.1; 57.7, GPU 7.2 ms) and on the integrated AMD GPU (29.5, median 33.3 ms; 29.8 in Chrome, median 33.2, p99 37.2; its first run in Chrome there failed an assertion that the log did not keep, the second passed); sudden changes over the fixed flight: 17 tiles in 14 frames, none over two at once.
