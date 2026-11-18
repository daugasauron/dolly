# Blender in Dolly, stage 4: the interface on softpipe, to measure

- STATUS: CLOSED
- PRIORITY: 120
- TAGS: blender,port,demo,display

Research and the whole plan: `work/research/blender-2026-11-17.md` (the section on the GPU
module). Stage 1 is [20261116-230501-blender-1](../20261116-230501-blender-1/TASK.md).

## State (2026-11-18)

Changed by the owner (2026-11-18): "Yes go directly to hardware accelerated for blender. Do it in
the same way as godot, and learn from that." The OpenGL interface on softpipe is not built and
not measured: this stage's GHOST system is built for stage 5's WebGPU backend instead
([20261116-230506-blender-5](../20261116-230506-blender-5/TASK.md)), on `port/blender-ui`.

- Written: `demos/blender/ghost/` (`GHOST_SystemDolly`, `GHOST_WindowDolly`,
  `GHOST_ContextWebGPU`), placed in `intern/ghost/intern` by the source archive and named to
  CMake by `blender-dolly.patch` (`WITH_GHOST_DOLLY`). One window a time fills the page's
  surface (`display@0`); keys, text, the pointer, the wheel and focus are `input@0`'s records
  as GHOST's events (letters by the layout's key, the rest by the key's place); the clipboard is
  `clipboard@0`'s; CSS cursors for GHOST's standard ones; no pointer warp. The context holds no
  device: the GPU backend opens gpu@0 and presents on the window's swap.
- Runs with stage 5's backend (2026-11-18): Blender's interface on the page in Chrome and
  Firefox on the NVIDIA adapter; `demos/blender/test/blender-gpu-browser.mjs` reads the frame
  back, presses Escape for the splash screen and K, which a key map item of its script takes,
  and passed in both (13:33, the image of 05f70697b). Without WebGPU Blender says it found no
  GPU backend and quits.

## What

Blender's window on the page, drawn by its OpenGL backend on Dolly's Mesa, to learn what the
window system needs and how slow softpipe is. Not meant to be used.

- A GHOST system for Dolly (`intern/ghost`): one window, the page's surface (`display@0`), keys
  and the pointer (`input@0`), the clipboard; an OpenGL context on Mesa's surfaceless EGL, each
  frame read back and presented, as Godot's `display_server_dolly.cpp` does (610 lines). It is a
  new platform file beside upstream's, the patch names it to CMake.
- The OpenGL backend needs 4.3 core, `ARB_shader_draw_parameters`, `ARB_clip_control` and
  `ARB_get_texture_sub_image` (`gpu/opengl/gl_backend.cc`), compute shaders and storage buffers
  for the draw manager. Softpipe has 3.3 and parts of 4.3 (`MESA_GL_VERSION_OVERRIDE`): list
  what Blender asks for and softpipe lacks, from its start-up log.
- Epoxy (in `gtk-build`) as the loader; Mesa from `mesa-build`.
- Measure: whether the interface starts; seconds for the first frame; a redraw of the default
  layout at 1280 by 800 and at 640 by 400; a hover; the 3D view in solid mode.

## Size and risks

3 to 5 days. Softpipe may refuse a shader the draw manager cannot do without, in which case the
stage ends with the list and the GHOST system, which stage 5 needs anyway. Expect seconds a
frame: Godot's sprite scene drew at 11.7 frames a second at 640 by 360, and Blender draws far
more.

## Done when

The measurements are in the README, or the list of what softpipe lacks is, and the GHOST system
is committed with a test that sees a frame and sends a key.

## Closed (2026-11-18)

The owner dropped softpipe for the hardware path, so neither its measurements nor its list exist.
The GHOST system is committed (`demos/blender/ghost`, 59e8a25e4) with the test that sees a frame
and sends a key: `demos/blender/test/blender-gpu-browser.mjs` passed in Chrome and Firefox on the
NVIDIA adapter (d6a8ca2d0), drawing through stage 5's backend, where the rest goes on.
