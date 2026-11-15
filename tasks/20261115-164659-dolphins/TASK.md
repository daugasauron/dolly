# Voxel Flyover 7: dolphins beside a board that skims, lightning in the deepest clouds, a cinder cone

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`. The brief (`work/briefs-2026-11-15/flyover7.md`, point 6) and the owner's "more variety/interaction" and "fantasy like environments".

Done when: each is in the game, looked at in stills, measured on both adapters, and the image's test passes with it.

- Dolphins (`build_pod` in `main.gd`): five of one baked mesh, hidden until the board skims the sea (`skim` over 0.5); they come up over two seconds and leap along beside and ahead of the board, and go under when it climbs or nears a shore.
- Lightning (`cloud.gdshader`): where the clouds' field is deepest (over 0.76, a few cells in a hundred, which stand together), a cluster is lit from within twice in quick succession, in three of ten turns of six seconds. Only the cluster is lit, not the screen.
- A cinder cone (`CONE` in `terrain.gd` and `landmarks.gd`): dark rock 46 units high in the dry lands, rare, its crater and a stream of lava alight at night, smoke over it.

## Closed (2026-11-16, 03:12)

In the image built at 03:01 (with them, the gusts in the cape and the coats, and the white horses kept from glowing at night) the game's test passes: Chrome 156 on the NVIDIA card 59.6 a second (GPU 7.0 ms), Firefox 159 57.5 (7.3 ms); on the AMD GPU Firefox 29.1 (median 33.8 ms) and Chrome 28.7 (34.6): under the 29.8 of the evening, see the next task. Lightning shows in the fixed flight's measure as one sudden change (32.0 s), as meant; by day it is faint and rarer than first made.
