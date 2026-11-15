# Voxel Flyover 7: the autopilot's camera holds wide views that show the world

- STATUS: OPEN
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Brief: `work/briefs-2026-11-15/flyover7.md` and the integrator's message of 21:15. Branch `feature/flyover-4`.

Owner (2026-11-15, evening): "Also, the camera control of the auto pilot is terrible, way too zoomed in. Zooming in a bit sometimes is nice but the nice part is the world, thats what it should show off."

Now: five views of ten seconds each, three of them close on the flyers.

Done when: while the game flies itself the camera mostly holds wide views (the landscape, the horizon, towns and coasts as they come), moves in close only now and then, briefly and smoothly, and never cuts; checked on a few minutes of recorded autopilot by its framing.

## State (2026-11-15, 21:45)

Done in the game's code: the flight's own camera has a round of 68 s, six views: far behind (14 s), far beside (12), high and far (13), close beside the pelican (5), far ahead looking back (11), high behind to one side (13), each gliding into the next. Looked at in 17 stills 4 s apart: 16 wide, 1 close. The low clouds were in the wide views' way (the camera was in one in 4 of 17 stills): they now stand 135 to 199 units over the sea instead of 100 to 159, and the air in one whitens less (0.018 for 0.03). Left: the image's test, and a look at minutes of it in a take.
