# Voxel Flyover 7: the corgi's mouth without the black shape, a tongue that trails from one side in the wind

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4` (the game's task, with how it is measured). Brief: `work/briefs-2026-11-15/flyover7.md`. Branch `feature/flyover-4`.

Owner (2026-11-15 19:40): "Remove the black thing in the mouth, and make the tongue of the dog go backward on one side abd blow in the wind similar to how the cape looks."

Done when: no black shape shows in the mouth; the tongue trails backwards out of one side of the mouth, moves in the wind as the cape does, and is joined to the mouth at every zoom and angle; looked at in stills from the front, the side and behind, near and far.

## Closed (2026-11-15, 22:45)

No dark shape in the mouth: the jaw is closed under the muzzle. The tongue is a strip of the cape's cloth that comes out of the left side of the mouth, trails back and tapers, and flutters by the cape's shader. Looked at from the side and from the front at 30 to 34 degrees of view (the studio copy) and in the take. Verified in the image of `a81fb3764`: the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.9 a second, GPU 6.4 ms, median 16.8 ms, p99 19.6, max 24.3; 58.7, GPU 6.6 ms) and on the integrated AMD GPU (30.0, median 33.1 ms, p99 36.9; 29.6 in Chrome); take `work/videos-2026-11-15/voxel-flyover-7/take1.mp4` (of the same commit).
