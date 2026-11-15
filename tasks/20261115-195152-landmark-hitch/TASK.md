# Voxel Flyover 7: a frame of 100 ms in Firefox each time a landmark came near

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: godot,demo,flyover,0.1.8

Parent: `tasks/20261114-170927-flyover4`. Branch `feature/flyover-4`. Left open in the parent since the evening: Firefox on the NVIDIA card had frames of 105 to 116 ms in the test's 30 seconds (2.9 s, 8.4 s, 25.9 s) and 8 hitches, where Chrome had frames of 35 to 40 ms at the same moments.

## Cause

Found by `build/flyover4/ffh.sh` (Firefox, the times of the frames over 36 ms) with one thing changed a run: not the camera's cuts; gone with no landmark built. Timing inside `Parts.bake`: 50 to 96 ms whatever the number of vertices (192 vertices: 56 ms; 1,314: 93 ms), and none of it in the loops over them. `PrimitiveMesh.get_mesh_arrays()` reads the primitive's buffers back from the GPU, some 10 ms a part through `gpu@0` in Firefox; a landmark has a dozen parts. (Two things tried first and not kept, each measured: the engine's `SurfaceTool.append_from` in place of the loops, 200 ms; whole-array transforms in place of the loops, no change.)

## Fix

`Parts.arrays_of` keeps a primitive's arrays by its kind and measures, so each shape is read back once.

Seen while looking at the lighthouse for it: its two red bands were inside its tower (narrower than it at their heights) and never showed. They are a hair wider than the tower now.

## Closed (2026-11-16, 05:00)

Fixed. In the image built at 04:52 the game's test: Chrome 156 on the NVIDIA card 59.6 a second, longest frame 32 ms, no hitch (40 ms and 3 before); Firefox 159 57.4, longest 66 ms, 4 hitches (114 ms and 8); on the AMD GPU Firefox 30.0, longest 59 ms, no hitch (130 ms and 2), Chrome 29.6, longest 46 ms, no hitch (101 ms and 2).

## Closed (2026-11-16, 05:40)

Fixed (commit 9a7f8f11a). In the image built at 04:52 the game's test: Chrome 156 on the NVIDIA card 59.6 a second, longest frame 32 ms, no hitch (40 ms and 3 before); Firefox 159 57.4, longest 66 ms, 4 hitches (114 ms and 8); on the AMD GPU Firefox 30.0, longest 59 ms, no hitch (130 ms and 2), Chrome 29.6, longest 46 ms, no hitch (101 ms and 2). What Firefox has left: a frame of about 60 ms every ten seconds (7.0, 17.0 and 27.5 s into the flight, in each run). Not the game's script (its per-frame functions timed: none over 12 ms after the start) and not the beacon's chime (the same without it). A ten-second period points at the browser or the page's host, not at what the flight passes; not traced further.
