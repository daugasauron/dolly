# Blender in Dolly, stage 5: a WebGPU backend for Blender's GPU module on gpu@0

- STATUS: OPEN
- PRIORITY: 110
- TAGS: blender,port,demo,gpu

Research and the whole plan: `work/research/blender-2026-11-17.md` (the section on the GPU
module). Stage 4, the window system, is
[20261116-230506-blender-4](../20261116-230506-blender-4/TASK.md).

## State (2026-11-18)

The owner (2026-11-18): "Yes go directly to hardware accelerated for blender. Do it in the same
way as godot, and learn from that." So stage 4's OpenGL interface on softpipe is skipped: its
GHOST system (window, input, clipboard, event loop) is built for this backend, on branch
`port/blender-ui` (`work/blender-ui`).

Written and compiling (`demos/blender/webgpu`, 4,300 lines with the GLSL generation taken from
`vk_shader.cc`): every class of the plan's table, the backend's own WGSL for present, scissored
clears and mipmaps. Blender links with it (118 MB) and opens its window on gpu@0. First run, in
headless Chrome's SwiftShader (09:00): the device was lost in the first batches ("Device was
destroyed", a shader module's compilation dropped), the window stayed black, and Blender could
not be interrupted (GHOST had cleared ISIG, now left as it is). Second run (10:20): Blender's
startup compiles 300 shaders and sends nine frames, 0.7 MB of records each, in 0.1 s, then
quits on its timer; two shaders do not translate: the polyline's (a NaN constant, which WGSL
cannot spell: NaN now comes from a private variable) and the Gaussian splats' overlay
(`samplerBuffer`, a texel buffer WebGPU lacks). Normals are 16-bit (`use_hq_normals_workaround`):
WebGPU has no signed 10-10-10-2 vertex format.

11:20, SwiftShader on Xvfb (headless Chrome's `--disable-gpu` has no backing for a WebGPU canvas
and loses the device at the first frame): the whole interface draws, with its text, icons, the
splash's image, the outliner and properties, and the 3D view draws the default cube in Workbench's
solid mode with the camera, light and navigation gizmo. Fixed for it: a view of one aspect of a
depth-stencil texture takes the aspect's format; storage usage only for WebGPU's storage formats;
the surface's pass is its own small submission (a batch continued in a second packet lets the page
show the canvas between them, which destroys its texture). Left visible: the floor grid draws only
towards the horizon, without its axes. Measured (17:45, Chrome's SwiftShader): a line with one end
behind the camera draws nothing (a line in front lit 26 pixels; the same line reaching behind the
camera, either end first, 0; a triangle reaching behind it 650), and the grid's lines run to the
view's clip end on both sides, so every near one crosses the camera's plane: shortened to 8 m,
they all draw. The NVIDIA adapter in Chrome shows the same grid. Firefox on the NVIDIA adapter
draws that line (26 pixels, either end first): Chrome's WebGPU drops a line that crosses the
camera's plane where Firefox's clips it. Not worked around: the backend sees one vertex at a time.

12:00, the same on the NVIDIA adapter in Chrome (`nvidia blackwell`). Then (SwiftShader): the
polyline and armature shaders translate (Blender's shader preprocessor spells NaN out as
`uintBitsToFloat(0x7FC00000u)`, which the source now reads from a private variable), and the
selected cube has its outline: `texture()`/`textureLod()` of an integer 2D sampler, which WGSL
cannot sample, read the texel at the point, and a vertex shader writes its position into a
variable stored once at its end (spirv-wgsl negates y on each store to the position, and the
grid's and outlines' lines read their position back). The owner, on 9052 (16:00): "Somethign is
wrong with the font rendering in blender-ui in firefox. Chrome works fine." Firefox on the NVIDIA
adapter grants `maxTextureDimension2D` 32,767; Blender's font atlas is `GPU_max_texture_size()`
wide and reads its texels by a mask and a shift of that width, so every odd texel was read as its
even neighbour. The backend now reports the largest power of two in the limit, and the GPU test
draws words on the GPU against Blender's font library drawing them on the CPU (Firefox matched
0.86 to 0.91 of the lit pixels before; Chrome, SwiftShader and Firefox on lavapipe match
exactly). 13 shaders do not translate, all for
curves, point clouds, Grease Pencil or Gaussian splats: their `samplerBuffer` is a texel buffer,
which WebGPU lacks (a storage buffer read by index would replace it).

Found in Dolly's provider, fixed with the port:
- A shader or pipeline released in the batch that creates it, before its compilation is known,
  failed the batch (`resource.value` was still null); `gpu-explicit.c` releases one so.
- After a device loss, a batch waiting for a frame slot (`queueFull`, three frames unshown)
  waited forever: the page stops counting animation frames for an inactive surface. The loss
  now lets those frames go.

## What Godot's port teaches (2026-11-18)

Read: `demos/godot/platform` (`display_server_dolly.cpp`, `rendering_context_driver_webgpu.cpp`,
`rendering_device_driver_webgpu.cpp`, 3,170 lines), `demos/godot/spirv-wgsl`, `docs/gpu.md`,
`host/gpu/` and the tasks `20261108-040718-godot-gpu` (with its `DESIGN.md`) and
`20261109-143500-gpu-background-pipelines`.

- **The shape.** Godot's driver writes gpu@0's explicit records itself: it numbers handles as it
  queues their creating records (the provider numbers them in the order it meets them), keeps
  object records in a pending list sent before the frame's commands, fills packets of at most
  1 MiB and 1,024 records, continues one encoder across packets (`BATCH_CONTINUE`) and ends it
  with `SUBMIT`. Blender's backend does the same; no new gpu@0 record is needed for the first
  milestones.
- **Shaders.** Godot compiles Vulkan GLSL to SPIR-V with glslang and translates it with
  `spirv-wgsl` (Tint's SPIR-V reader and WGSL writer after SPIRV-Tools' passes and 15 of
  Dolly's). Its passes already do what Blender's Vulkan GLSL needs: the vertex position's y is
  negated (Vulkan's clip space points down, WebGPU's up, so framebuffers keep Vulkan's row
  order and its front faces), point size is dropped, push constants become a read-only storage
  buffer at group 0 binding 0 bound with a dynamic offset, `isnan`/`isinf` and non-finite
  constants are rewritten, unwritten vertex-stage storage is marked read-only, combined image
  samplers are split (images, then samplers). Blender's backend therefore generates the GLSL its
  Vulkan backend generates (`vk_shader.cc`: one descriptor set, `#version 450`, depth retargeted
  to 0..1 at the end of the vertex stage) and feeds it to the same two steps.
- **Refuse up front what the device lacks.** A refused record loses every object queued after it
  in that batch and every later batch that names one: Godot checks storage formats, binding
  counts per stage and texture formats before it queues a record. Blender's backend does too,
  and reports a shader the translator or the device refuses once, by name, keeping the program
  running (Godot kept such a variant without modules and its pipelines refused).
- **Pipelines.** A batch's shaders and pipelines are created together and awaited before the
  batch first sets one (`fae57f486`): queue creations early in the batch. Creation returns at
  once, so the first frame that needs a new pipeline waits for its compile inside the provider
  (Godot's first selection: 39 ms in Chrome); background compiles are an open gpu@0 task.
- **Uploads.** Queue writes (`WRITE_BUFFER`, `WRITE_TEXTURE`) happen before the encoder they were
  sent with: a range is written once per submission, or the data goes through a staging buffer
  and a copy in the encoder. Godot sends only the 4 KiB blocks of a persistent buffer that
  changed (2.1 MB a frame became 70 to 100 KB).
- **Readback** is `MAP_READ` then `READ` of 64 KiB a call, after the GPU has finished: the driver's
  only waits. Firefox settles maps on its next submission or a 100 ms timer; the provider now
  submits empty batches meanwhile (p90 10 ms). Blender reads back for selection and colour
  picking only.
- **Frames.** The surface is view 0 of a view pass; the page shows one frame per animation frame
  and holds the next batch while three are unshown. A frame drawn into a texture is read back
  only for an X window (64 KiB a call). Firefox draws no frame once a surface is sized again
  (`tasks/20261116-223911-planet-day`), so the window keeps its first size; under Xvfb Firefox
  shows no WebGPU canvas at all, so tests read the frame back (`CAPTURE_FRAME` or a copy).
- **Quotas** (docs/gpu.md): 65,536 objects a scope (Godot's editor held 9,502), 4 GiB of buffers
  and textures, 1 GiB a buffer, 64 queued submissions. Released handles are invalid at once.
  Blender's backend counts its objects and releases what Blender frees.
- **Limits** (`DESIGN.md`, RTX 5070): Chrome grants 4 bind groups and, a stage, 48 sampled
  textures, 16 samplers, 16 storage buffers, 8 storage textures, 12 uniform buffers; Firefox 8
  groups and 64 of each. Firefox has neither texture format tier (no r8 or rg16 storage).
  Neither browser gives f16 on that NVIDIA driver in Chrome, nor subgroups in one path: Godot
  reports neither, and so will Blender's backend.
- **Input** (display server): the window is the page's surface at the size `dolly_display_acquire`
  reports; a maximized or fullscreen window fills it. Pointer records are in surface pixels.
  Keys come with the browser's `key` and `code`, Godot maps them with its web platform's table.
  The clipboard is `clipboard@0`'s while held, the program's own otherwise. A focus record makes
  a covered program redraw. The page's motion arrives once a frame (`pointermove`), and a program
  waiting for input should wake on the record rather than sleep a fixed time
  (`OS_Dolly::add_frame_delay`).
- **Tests** run on the hardware adapter under `work/.slots/gpu.lock`, Chrome with
  `--enable-unsafe-webgpu --use-angle=vulkan --enable-features=Vulkan,VulkanFromANGLE` on a
  private Xvfb, Firefox through Playwright's installed Firefox (`TMPDIR` under `$HOME` for the
  snap), each reading its own frame back (`demos/godot/test/godot-gpu-browser.mjs`). Headless
  Chrome with `--enable-unsafe-webgpu` gets SwiftShader, enough to develop on without the GPU.

## The backend's plan (2026-11-18)

Files Dolly adds to Blender's tree, as Godot's port adds `platform/dolly`: kept in
`demos/blender/` and placed by the source archive, while `blender-dolly.patch` names them to CMake
and adds the backend's enum values. Estimates in lines:

| Piece | What | Lines |
| --- | --- | --- |
| GHOST system (`intern/ghost/intern/GHOST_SystemDolly`, `GHOST_WindowDolly`) | one window on `display@0` filling the page, keys, text, pointer, wheel and focus from `input@0` mapped to GHOST's events, the clipboard on `clipboard@0`, cursors, timers; `processEvents` waits on the next record | 700 |
| GHOST context (`GHOST_ContextWebGPU`) | no device of its own: the GPU backend opens gpu@0, the context calls its present on `swapBufferRelease` | 80 |
| Device and records (`wgpu_device`) | the scope, handles, pending object records, packets with `BATCH_CONTINUE`, staging and upload rings, readback, limits and features, object count | 500 |
| Backend and context (`wgpu_backend`, `wgpu_context`) | capabilities from `LIMITS`, allocators, frame begin and end, the window's back buffer (a texture), present by a pass that samples it upside down onto the surface, render and compute passes opened and closed as Blender's state needs them | 900 |
| State (`wgpu_state`) | blend, depth, stencil, cull, write masks and bias as a pipeline key; texture, sampler, image, uniform and storage bindings | 350 |
| Shaders (`wgpu_shader`, `wgpu_shader_interface`) | the Vulkan backend's GLSL generation, glslang to SPIR-V, `spirv-wgsl` to WGSL, the bind group layout of group 0 from the interface, push constants in a ring bound by dynamic offset (std430, as `vk_push_constants`), specialization constants as overrides, pipelines cached by state, vertex layout and attachment formats | 1,800 |
| Textures (`wgpu_texture`) | formats, uploads through staging and copies, data conversion (from `vk_data_conversion`), views, mipmaps, swizzle, read back | 1,000 |
| Framebuffers (`wgpu_framebuffer`) | attachments, scissored clears as draws, blits and copies, read back | 650 |
| Batches, buffers, immediate mode (`wgpu_batch`, `wgpu_vertex_buffer`, `wgpu_index_buffer`, `wgpu_uniform_buffer`, `wgpu_storage_buffer`, `wgpu_immediate`) | vertex layouts, draws and indirect draws, sub-range index buffers, the immediate ring, buffers as storage for polylines and the draw manager | 900 |
| The rest | queries, fences, pixel buffers, texture pool, debug groups | 200 |
| Patch | CMake, `GPU_BACKEND_WEBGPU` and its drawing context type, the backend's selection on Dolly | 120 |

About 7,000 lines, against the OpenGL backend's 11,000. Libraries: glslang at the commit Blender
pins for its shaderc (`d213562e`, in `blender-deps`), `spirv-wgsl`, `libdolly-gpu`,
`libdolly-display`, `libdolly-input`, `libdolly-clipboard`.

Milestones, each with a test that sees the frame and sends a key in Chrome and Firefox on the
hardware adapter, the application image `blender-ui` and its server on 9052:

1. The window: GHOST's window on the page, Blender's event loop taking keys and the pointer, and
   a frame the backend clears and presents.
2. The interface's 2D drawing: widgets, text, icons, an empty 3D view.
3. Workbench's solid mode of the default cube, with the overlays (grid, outline, gizmos); needs
   the draw manager's compute shaders and storage buffers.
4. EEVEE, much later.

Developed in a session of headless Chrome (SwiftShader's WebGPU) on `blender-deps`, Blender built
once there and rebuilt by unit after each change, as stage 1 was; images only at milestones.

## What

A fourth backend beside OpenGL, Vulkan and Metal in `source/blender/gpu`, on `gpu@0`'s explicit
records (`docs/gpu.md`), so that Blender's interface is usable in a browser with WebGPU.

- The backend's classes: context, batch, immediate mode, shader and its interface, texture,
  framebuffer, vertex, index, uniform and storage buffers, state manager, queries, fences, pixel
  buffers. The OpenGL backend is 11 thousand lines, Vulkan's 35 thousand with its render graph;
  Blender's API sets state between draws as OpenGL does, so passes must be formed from it.
- Shaders: Blender's GLSL to SPIR-V with glslang, as the Vulkan backend does with shaderc
  (`vk_shader_compiler.cc`), then SPIR-V to WGSL with Tint, the `spirv-wgsl` package of the
  Godot port. 340 `.glsl` files, 142 compute entry points; none has a geometry stage.
- What WebGPU lacks and each answer: `gl_Layer` (a pass a layer), writable storage texture
  formats and four a stage (EEVEE's shadows and volumes), point size, wide lines and polygon
  mode (quads), swizzle views, buffer textures, 1D arrays, synchronous readback for selection
  (`WAIT`, 64 KiB a call), the optional features to request (dual-source blending, clip
  distances, depth clamp, indirect first instance), the default limits.
- Order: the interface and Workbench (solid view), then the overlays, then Cycles in the
  viewport (a texture), then EEVEE, perhaps in part.
- Tests on a hardware adapter in Chrome and Firefox, each reading its own frame back, as
  `demos/godot/test/godot-gpu-browser.mjs` does.

## Size and risks

3 to 6 weeks: the largest stage. Risks: EEVEE's reliance on features WebGPU does not have;
Firefox has neither of WebGPU's texture format tiers (Godot's notes); shader translation of the
whole set; readback latency for picking; Blender's GPU API changes every release, so the backend
is a patch to carry.

## Done when

The default layout draws and takes input at interactive rates on `gpu@0`, the solid view shows
the default scene, and the README lists what does not draw.
