# Voxel Flyover 7: landscape variety with rarity: high mountains, rivers and valleys, oceans with islands

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4` (the game's task, with how it is measured). Brief: `work/briefs-2026-11-15/flyover7.md`. Branch `feature/flyover-4`.

Owner (2026-11-15 19:40): "I want more variation in the landscape, with some things that are more rare, like high mountains. Also rivers and valleys, and larger ocean like water with islands."

Done when: rare high mountains above the usual range, snow-capped; rivers that run downhill through valleys to the sea; larger oceans with islands and archipelagos; common things common and rare things rare, by noise at several scales, deterministic and endless, every transition blended; the flight (terrain.gd) agrees with what is drawn; looked at in stills of each, and the frame times and sudden changes hold.

## Closed (2026-11-16, 00:20)

Slow fields at 1.9, 2.7, 5.1, 7.3, 11, 19 and 53 thousand units, each turned and placed by itself: oceans and continents with islands, the relief of regions, rare massifs (peaks to 2.5 times, the nearest eleven thousand units from the start), rivers in valleys at the sea's level, countries of climate, and a realm of wonders. Of the land 60 per cent is plain, 27 hills, 11 mountains, 2 high peaks (`tasks/20261115-*-balance`). Far from the start (100 thousand and a million units) the picture is whole; no recentring was added: a million units is nine hours of flight, and close views would show the floats' steps of 0.06 there. Verified in the image of `d6993c1b2` (2026-11-16, 00:15): the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.6 a second, GPU 6.7 ms, median 17.0 ms, p99 20.1; 57.7, GPU 7.2 ms) and on the integrated AMD GPU (29.5, median 33.3 ms; 29.8 in Chrome, median 33.2, p99 37.2; its first run in Chrome there failed an assertion that the log did not keep, the second passed); sudden changes over the fixed flight: 17 tiles in 14 frames, none over two at once.
