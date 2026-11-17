# gpu@0: pipelines a program compiles in the background, without stalling its frames

- STATUS: OPEN
- PRIORITY: 300
- TAGS: gpu,godot,performance

## State (2026-11-09)

Measured, not started. The first time Godot's editor draws something new (an Inspector, a dialog,
a material's preview) its frame waits for WebGPU to compile pipelines; Godot itself is built to
draw with its ubershaders meanwhile.

## Evidence

Godot (4.4 and later) compiles a specialized pipeline on a worker thread and draws with its
ubershader until `render_pipeline_create` returns there. The driver
(`demos/godot/platform/rendering_device_driver_webgpu.cpp`) queues the creation record and returns
at once, so the next frame's batch both creates and sets the pipeline, and the provider awaits the
compile before it can encode that frame. Selecting a node the first time, the editor's batch
created ten pipelines: 87.6 ms in Chrome when each was awaited in turn, 39.4 ms since they compile
in parallel (`fae57f486`), 7.5 ms in Firefox. A mesh's preview, 0.6 s later, made a batch of
twelve shaders and a pipeline: 32 to 40 ms in Chrome.

Returning only once the compile is done would fix it, as Vulkan's `vkCreateGraphicsPipelines` on
that thread does, but gpu@0 serves one request at a time per scope: a worker thread waiting on a
request holds back the frame's batch as much as the compile does.

## Voxel Flyover (2026-11-17): its start, not its flight

Asked whether pipelines made in mid-flight are among the game's slow frames
(`tasks/20261117-095742-planet-night`): they are not. Counted in the GPU Worker
(`build/planet/measure.mjs --pipelines`: each batch that waited for pipelines, how many, how
long, when), the browser on two cores, the NVIDIA RTX 5070:

| | batches that waited | pipelines | waited, in sum | the longest | the last one |
| --- | --- | --- | --- | --- | --- |
| Chrome, a flight of 180 s that climbs to 8,260 units | 40 | 1,132 | 33.0 s | 4.6 s (137 pipelines) | 61 s after gpu@0 opened, 5 s into the flight |
| Firefox, 90 s on the ground | 40 | 1,132 | 4.6 s | 0.4 s | 30 s after gpu@0 opened |

No pipeline is made after the flight's first seconds: the game draws everything it will draw
once at its start (`warm_up`). What this task would give the game is its start in Chrome,
where the first frames wait half a minute in sum for pipelines Godot could draw without; in
Firefox the same pipelines cost a seventh of that. Not started: it takes the contract's
addition, the driver's change and a build of Godot, and the browser host of
`integrate/0.1.8`, which `feature/planet` does not have.

## Done when

A program can create a pipeline on one thread and learn when it is compiled while another thread's
batches go on (for example a compiled sequence the provider writes and a client waits on), with the
quota and boundary entries of any contract addition, the driver returning from
`render_pipeline_create` off its main thread only when compiled, and the editor's first selection
measured against 39.4 ms in Chrome.
