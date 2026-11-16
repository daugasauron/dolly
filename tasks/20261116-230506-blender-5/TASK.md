# Blender in Dolly, stage 5: a WebGPU backend for Blender's GPU module on gpu@0

- STATUS: OPEN
- PRIORITY: 110
- TAGS: blender,port,demo,gpu

Research and the whole plan: `work/research/blender-2026-11-17.md` (the section on the GPU
module). Stage 4, the window system, is
[20261116-230506-blender-4](../20261116-230506-blender-4/TASK.md).

## State (2026-11-17)

Not started.

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
