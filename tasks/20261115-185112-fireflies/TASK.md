# Voxel Flyover 7: fireflies, and a flight of ten minutes looked through

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`. The brief (`work/briefs-2026-11-15/flyover7.md`, point 6): keep going, checking by looking and measuring.

- Fireflies (`fireflies.gdshader`): at night, over warm wet land that is neither town nor sea, twelve points of yellow-green light for each cell of 36 units within 230 units of the flyer, wandering a few units over the ground and blinking, not in rain; not on the two weakest levels. Looked at in a low flight at night.
- A flight of ten minutes by itself in Chrome on the NVIDIA card (from 08:00, five days and nights of the game, 24 thousand units, 66 beacons), a still every 25 seconds looked through: no error, no broken frame; coasts, towns of several kinds, ice seas, deserts, woods, nights with fireworks.
- `nine_each` became `some_each(grid, each)`, which the fireworks and the fireflies use too.

## Closed (2026-11-16, 04:00)

In the image built at 03:52 the game's test passes: Chrome 156 on the NVIDIA card 59.6 a second (GPU 6.7 ms), Firefox 159 56.9 (7.1 ms); on the AMD GPU Firefox 29.9 (median 33.0 ms) and Chrome 29.9 (33.2). Sudden changes over the fixed flight as before (23 tiles in 18 frames).
