# Voxel Flyover 7: pointed tops on some of a city's towers, wisps of high cloud

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`. The owner's point 5 (`work/briefs-2026-11-15/flyover7.md`): city variety. A city's towers were all flat-roofed boxes.

- Three towers in ten end in a point, low or high (to 0.84 of a lot over the walls), of green copper or of slate: four faces, a shape the far buildings' roof of 2 by 2 squares has too, so nothing changes where near and far buildings meet (`roof_rise` in `city.gdshader`). The flight's twin (`building_top` in `terrain.gd`) keeps the board over the highest a point can be.
- The high cloud's streaks were ten times as long as wide and read as rays toward the zenith; now four times, wisps (`sky.gdshader`).

## Closed (2026-11-16, 04:16)

Looked at in a flight at a city. In the image built at 04:08 the game's test passes: Chrome 156 on the NVIDIA card 59.6 a second (GPU 6.8 ms), Firefox 159 57.3 (7.3 ms); on the AMD GPU Firefox 29.8 (median 33.1 ms) and Chrome 29.6 (33.5). Sudden changes over the fixed flight: 22 tiles in 17 frames.

## Closed (2026-11-16, 05:19)

Closed at 04:16 (commit 26a3e1db9) with the flight's twin keeping the board over the highest any tower's point could be, on every tower: that changed the way the flight takes from the start (over mountains into a night of rain, takes 5 and 6). The twin now knows which towers are pointed and how high each point is (the same numbers as the shader's), so the flight clears a flat tower as before and takes the earlier way again: looked at in the opening 140 seconds. In the image built at 05:10 the game's test passes: Chrome 156 on the NVIDIA card 59.6 a second (longest frame 29 ms, no hitch), Firefox 159 57.9; on the AMD GPU 30.0 and 30.0 (median 33.2 ms both, no hitch).
