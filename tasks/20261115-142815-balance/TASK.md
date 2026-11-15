# Voxel Flyover 7: more flat land than mountains; the high peaks rare

- STATUS: CLOSED
- PRIORITY: 210
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`. Overlaps `tasks/20261115-115857-landscape`.

Owner (2026-11-16, 00:10, playing the build): "I'm not sure if Im in one of those zones and it gets different if I get away, but now I feel like there are mountains everywhere. I do love the mountains and how they look but there should be way more flat parts than mountainous in general. I guess everyhting can be a bit hilly but I think the super tall mountains (which are super cool) should be more rare."

The owner was in one: that build had a massif country begin three thousand units east of the start (placed there so it would be met soon).

Measured (`mix.mjs` in the takes' tools: the ground every 60 units along six straight ways of 100 thousand units from six starts; of the land, by its height over the sea: plain under 20 units, hills 20 to 50, mountains 50 to 140, peaks over 140):

| | Sea | Plain | Hills | Mountains | Peaks |
| --- | --- | --- | --- | --- | --- |
| Before | 40 % | 31 % | 43 % | 24 % | 2.4 % |
| After | 43 % | 60 % | 27 % | 11 % | 2.1 % |

Done when: over half of the land is plain or gently rolling, hills about a quarter, mountains about a tenth, the high peaks rare and gathered in massifs that come minutes apart; the mountains look as they did; the start opens on varied, mostly gentle land with mountains on the horizon.

## Closed (2026-11-16, 00:20)

Of the land along 600 thousand units of straight ways: 60 per cent plain, 27 hills, 11 mountains, 2.1 high peaks, all of those in massifs (before: 31, 43, 24, 2.4); the nearest massif is eleven thousand units from the start. The opening flight is over fields, towns and a coast with one mountain on the horizon. Verified in the image of `d6993c1b2` (2026-11-16, 00:15): the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.6 a second, GPU 6.7 ms, median 17.0 ms, p99 20.1; 57.7, GPU 7.2 ms) and on the integrated AMD GPU (29.5, median 33.3 ms; 29.8 in Chrome, median 33.2, p99 37.2; its first run in Chrome there failed an assertion that the log did not keep, the second passed); sudden changes over the fixed flight: 17 tiles in 14 frames, none over two at once.
