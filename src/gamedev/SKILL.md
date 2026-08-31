---
name: dolly-gamedev
description: Build interactive C games in Dolly with raylib 6, Box2D 3, and the exclusive in-Wasm framebuffer.
---

# Dolly gamedev

Use raylib for software rendering and Box2D for physics. Both are real pinned
upstream libraries compiled from source while `Dollyfile-gamedev` executes.

## Installed surface

- raylib 6.0: `/usr/include/raylib.h`, `/usr/include/raymath.h`,
  `/usr/lib/libraylib.a`
- Box2D 3.1.1: `/usr/include/box2d/`, `/usr/lib/libbox2d.a`
- Dolly adapter: `/usr/include/dolly/raylib.h`,
  `/usr/lib/libdolly-raylib.a`
- Complete retained sources: `/usr/src/raylib`, `/usr/src/box2d`, and
  `/usr/src/dolly/gamedev`
- Example game: `/usr/src/dolly/gamedev/graphics-demo.c`

Build a game with:

```make
game: game.c
	cc -std=c17 game.c -o game -ldolly-raylib -lraylib -lbox2d
```

## Frame loop

Call `dolly_raylib_open()` once. For each frame, call raylib `BeginDrawing()`,
draw normally, then call `dolly_raylib_end_frame()` instead of `EndDrawing()`.
Read semantic browser events with `dolly_raylib_next_event()`. Close with
`dolly_raylib_close()` on every exit path. The runtime also releases a stranded
lease when a foreground command exits or is interrupted.

The raylib build uses upstream `PLATFORM_MEMORY`, so rendering stays in Wasm;
the adapter only copies its completed RGBA image into Dolly's shared display.
There is no DOM, canvas, WebGL, browser callback, host filesystem, or socket API
inside a game. Keep automated checks finite with a `--frames N` option.

Box2D 3 uses opaque IDs and C17. Initialize definitions with helpers such as
`b2DefaultWorldDef()`, use a fixed step (normally 1/60 with four substeps), and
compile with the libraries after the object/source that references them.
