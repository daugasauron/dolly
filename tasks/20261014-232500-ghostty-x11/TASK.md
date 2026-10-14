# Ghostty, the whole application, in an X11 window in Dolly

- STATUS: OPEN
- PRIORITY: 80
- TAGS: graphics,demo,owner

Owner (2026-10-14): "There is no rational reason for this. I just want to
make it work because its cool." Dolly's terminal already is Ghostty's core
(libghostty-vt in `Dollyfile-ghostty-build`); this is Ghostty's GTK window
with its own renderer, running on Dolly's X server.

Done when `ghostty` opens a window on Dolly's X server and a shell runs in it,
with a browser test.

## State (2026-10-14, 23:25): waits for X11

Each step needs the one before it; details from memory are marked:

1. X11 on Dolly ([windows](../20261014-211501-windows/TASK.md), branch
   `demo/x11`): an X server, a window manager and clients.
2. GTK on X11: a GTK3 application, then GTK4 and its libraries (GLib,
   Pango, HarfBuzz, cairo, graphene and others) built inside Dolly. Ghostty's
   Linux front end is GTK4 (from memory).
3. OpenGL without a GPU: Ghostty's Linux renderer needs OpenGL 3.3 (from
   memory). Mesa's software "xlib" driver does GL in the client and sends
   finished frames as images, so the X server needs no GL (from memory,
   unchecked), with softpipe as the rasterizer: llvmpipe generates machine
   code at run time, which a Wasm process cannot run.
4. Ghostty: Dolly's Zig has only its C backend and no `zig build`, so the
   application's `build.zig` is replicated by hand as for libghostty-vt.
   Threads exist (`threads@0`) for its renderer and IO threads.
