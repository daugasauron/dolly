# Voxel Flyover 7: the pelican holds the handlebar with its wings, without arms beside them

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4` (the game's task, with how it is measured). Brief: `work/briefs-2026-11-15/flyover7.md`. Branch `feature/flyover-4`.

Owner (2026-11-15 19:40): "The pelican should hold the streering bar with its wings, not it somehow have arms and wings."

Done when: nothing arm-like besides the wings; each wing reaches from the shoulder to a grip and holds it, reads as a wing (feathers, its shape), and stays on the grip as the pelican pedals and the handlebar turns each way; looked at in stills from the front, the side and behind.

## Closed (2026-11-15, 22:45)

Each wing's leading edge runs thin from the shoulder to the elbow to the wrist at the grip, laid each frame; eight black-tipped flight feathers hang from all along it and trail in the wind, and three black feathers are closed over the grip. The thick limbs and the ball on the grip are gone. Looked at from the front left at four pedal phases and in the take's close view of the pelican. Verified in the image of `a81fb3764`: the game's test passes in Chrome 156 and Firefox 159 on the NVIDIA card (59.9 a second, GPU 6.4 ms, median 16.8 ms, p99 19.6, max 24.3; 58.7, GPU 6.6 ms) and on the integrated AMD GPU (30.0, median 33.1 ms, p99 36.9; 29.6 in Chrome); take `work/videos-2026-11-15/voxel-flyover-7/take1.mp4` (of the same commit).
