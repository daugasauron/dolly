# Voxel Flyover 7: the autopilot's camera holds wide views that show the world

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Brief: `work/briefs-2026-11-15/flyover7.md` and the integrator's message of 21:15. Branch `feature/flyover-4`.

Owner (2026-11-15, evening): "Also, the camera control of the auto pilot is terrible, way too zoomed in. Zooming in a bit sometimes is nice but the nice part is the world, thats what it should show off."

Now: five views of ten seconds each, three of them close on the flyers.

Done when: while the game flies itself the camera mostly holds wide views (the landscape, the horizon, towns and coasts as they come), moves in close only now and then, briefly and smoothly, and never cuts; checked on a few minutes of recorded autopilot by its framing.

## Closed (2026-11-15, 22:45)

The flight's own camera has a round of 68 s of six views that glide into one another: far behind (14 s), far beside (12), high and far (13), close beside the pelican (5), far ahead looking back (11), high behind to one side (13). In 17 stills 4 s apart 16 are wide and one close; the take's first 139 s are that round. The low clouds stand higher (135 to 199 units over the sea) and whiten the air less, so the wide views are not in them. Sudden changes over the fixed flight fell with it: 45 tiles in 11 frames, against 70 in 55. Verified in the image of `a81fb3764`: the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.9 a second, GPU 6.4 ms, median 16.8 ms, p99 19.6, max 24.3; 58.7, GPU 6.6 ms) and on the integrated AMD GPU (30.0, median 33.1 ms, p99 36.9; 29.6 in Chrome); take `work/videos-2026-11-15/voxel-flyover-7/take1.mp4` (of the same commit).
