---
name: dolly-gamedev
description: Build interactive C games in Dolly with raylib 6, Box3D 0.1, and the exclusive in-Wasm framebuffer.
---

# Dolly gamedev

Use raylib for software-rendered 2D or 3D graphics and Box3D for three-dimensional
rigid-body physics. Both are pinned upstream libraries compiled from source,
sequentially, while `Dollyfile-gamedev` executes.

## Installed surface

- raylib 6.0: `/usr/include/raylib.h`, `/usr/include/raymath.h`,
  `/usr/include/rlgl.h`, and `/usr/lib/libraylib.a`
- Box3D 0.1.0: `/usr/include/box3d/` and `/usr/lib/libbox3d.a`
- Dolly presentation adapter: `/usr/include/dolly/raylib.h` and
  `/usr/lib/libdolly-raylib.a`
- Retained source: `/usr/src/raylib`, `/usr/src/box3d`, and
  `/usr/src/dolly/gamedev`
- Example 3D physics game: `/usr/src/dolly/gamedev/graphics-demo.c`

Build a game with:

```make
game: game.c
	cc -std=c17 game.c -o game -ldolly-raylib -lraylib -lbox3d
```

## Frame loop

Call `dolly_raylib_open()` once. For each frame, call raylib `BeginDrawing()`,
draw normally, then call `dolly_raylib_end_frame()` instead of `EndDrawing()`.
Call `dolly_raylib_wait_frame()` once per loop for browser animation-frame
pacing. Read semantic browser events with `dolly_raylib_next_event()` and use
`dolly_raylib_set_cursor()` with a `DOLLY_DISPLAY_CURSOR_*` value when the game
needs a pointer style. Close with `dolly_raylib_close()` on every exit path.
The runtime also releases a stranded lease when a foreground command exits or
is interrupted.

The raylib build uses upstream `PLATFORM_MEMORY`, so rendering stays in Wasm.
The adapter asks raylib's software rasterizer to copy directly into Dolly's
inactive RGBA buffer, with no intermediate `Image` allocation. The browser
only presents that buffer. `dolly_raylib_open()` caps rendering at 800x450;
for a software-rendered 3D scene, prefer
`dolly_raylib_open_sized(..., 640, 360)`. The viewport aspect ratio is
preserved and the browser scales the completed frame to its canvas.

There is no DOM, canvas, WebGL, browser callback, host filesystem, or socket
API inside a game. Keep automated checks finite with a `--frames N` option.

## Box3D

Box3D uses opaque IDs, `b3Vec3`/`b3Pos`, quaternions, and C17. Initialize every
definition with its default helper, such as `b3DefaultWorldDef()` or
`b3DefaultBodyDef()`. Make boxes with `b3MakeBoxHull()` and
`b3CreateHullShape()`. Use `b3CreateSphereShape()` for spheres and step with a
fixed timestep, normally `b3World_Step(world, 1.0f / 60.0f, 4)`.

Dolly intentionally runs Box3D with one worker. Its small target adapter
replaces upstream's pthread-based timer/scheduler translation unit with clocks
and serial task semantics inside the same Wasm userspace. This changes no
physics API, gives the library no new browser import, and matches Dolly's
compatibility-over-parallelism runtime model.
