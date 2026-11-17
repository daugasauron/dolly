# Godot on gpu@0 waits for the GPU every frame while a viewport's render time is measured

- STATUS: OPEN
- PRIORITY: 200
- TAGS: godot,performance

## State (2026-11-17)

Found and measured in Voxel Flyover (`tasks/20261117-095742-planet-night`), which no longer asks
every frame. The driver is as it was. Left: the change below, a build of Godot and its editor,
and the same flight with the question asked every frame, which should then cost nothing.

## What happens

While a viewport's render time is measured (`RenderingServer.viewport_set_measure_render_time`,
and the editor's visual profiler), Godot's RenderingDevice captures timestamps and, as a frame
begins, reads those of the frame whose slot it takes again:
`RenderingDeviceDriverWebGPU::timestamp_query_pool_get_results`
(`demos/godot/platform/rendering_device_driver_webgpu.cpp`) resolves the query set, copies it,
submits, and reads the copy back through `read_buffer`, gpu@0's `MAP_READ` and `READ`: the
game's thread waits for the GPU to finish what was submitted, every frame. Vulkan answers the
same call without waiting, since the frame's fence has passed by then.

## Measured

Voxel Flyover's morning flight (`--autopilot 60 --day 9`), Chrome on the RTX 5070, two cores,
2026-11-17: 34 to 37 frames a second (median frame 28 to 30 ms) with the question asked every
frame, 56.2 (15.3 ms) without it; the GPU's own time was 7.8 ms a frame either way. The game's
thread waited in gpu@0 dispatches for 19.6 ms of a 29 ms frame (9.1 dispatches a frame, counted
in the process Worker).

## Done when

The driver asks for a frame's timestamps as the frame ends (resolve, copy and `MAP_READ` in the
frame's last packet, which does not wait) and `timestamp_query_pool_get_results` reads what was
mapped two frames before, or gives zeros while nothing is; and the flight above draws as many
frames a second with the render time measured as without.
