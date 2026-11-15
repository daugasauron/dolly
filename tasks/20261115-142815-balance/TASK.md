# Voxel Flyover 7: more flat land than mountains; the high peaks rare

- STATUS: OPEN
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

## State (2026-11-16, 00:30)

In the game (`terrain.gdshaderinc`, `terrain.gd`): ranges of mountains stand where their noise is over 0.56 (0.36 before), a low-relief region's are 0.22 of their height (0.3), the hills are a tenth lower, and a massif is where its field is over 0.81 (0.72), placed so that the nearest is some eleven thousand units east-south-east of the start (six minutes at the cruise) and none within 3,500. The peaks are all in massifs. Maps of 12.8 and 38 thousand units (`map.mjs`) and the opening flight looked at: fields, towns of three kinds, a coast, one mountain on the horizon. Left: the image's test.
