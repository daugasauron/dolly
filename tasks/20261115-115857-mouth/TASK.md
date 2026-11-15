# Voxel Flyover 7: the corgi's mouth without the black shape, a tongue that trails from one side in the wind

- STATUS: OPEN
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4` (the game's task, with how it is measured). Brief: `work/briefs-2026-11-15/flyover7.md`. Branch `feature/flyover-4`.

Owner (2026-11-15 19:40): "Remove the black thing in the mouth, and make the tongue of the dog go backward on one side abd blow in the wind similar to how the cape looks."

Done when: no black shape shows in the mouth; the tongue trails backwards out of one side of the mouth, moves in the wind as the cape does, and is joined to the mouth at every zoom and angle; looked at in stills from the front, the side and behind, near and far.

## State (2026-11-15, 21:45)

Done in the game's code, looked at from the side and the front at 30 to 34 degrees of view (the studio copy): the dark shape is gone, the jaw is closed under the muzzle, and the tongue is a strip of the cape's cloth (`cape.gdshader`) that comes out of the left side of the mouth and trails back, tapering. Left: the image's test in both browsers, and a look in a take.
