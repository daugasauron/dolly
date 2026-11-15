# Voxel Flyover 7: a frame of 160 ms when a thermal is first drawn

- STATUS: OPEN
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`.

Found 2026-11-15 by the probe's frame times: one frame of 160 to 220 ms some 12 s into the flight from the start (and at 4 s in version 6), in every run, in Chrome and Firefox on both adapters (the test's "max").

Cause: a thermal's column is first drawn when a plot with a town comes within 360 units, and its pipeline is made in that frame (with the thermals left out the frame is not long). A lighthouse's beam and the rain would do the same.

Done when: no frame over 60 ms after the first second of a flight of 60 s.

## State (2026-11-15, 23:10)

Fixed in the game: `warm_up` draws the thermal's and the beam's materials once at the start in a card under the board for three seconds, and the rain is drawn (with nothing in it) for the first three seconds. Measured over 60 s by itself: the longest frame 33.4 ms (164 before), none over twice the median. Left: the image's test in both browsers on both adapters.
