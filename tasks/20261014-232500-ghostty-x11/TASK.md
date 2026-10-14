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

## State (2026-10-15, 01:00): X11 runs; GTK is next

Step 1 is done on branch `demo/x11` ([windows](../20261014-211501-windows/TASK.md)).
Step 4 no longer means replicating `build.zig`: a Zig with LLVM and
`zig build` is being built ([Zig with LLVM](../20261014-234000-zig-llvm/TASK.md)).

For step 2, the X11 port's estimate (not yet tried): GLib, cairo, pango,
harfbuzz, fribidi, fontconfig, gdk-pixbuf and libepoxy with Meson; xcb
render/shm, Xrandr, Xcursor, Xinerama, Xcomposite and Xdamage; `threads@0`
for GLib; RandR in the server's SDL output. The likely long pole: GObject
calls signal handlers through casts to functions with more parameters than
they declare, which traps in WebAssembly. That needs patches (wasm-vips keeps
such patches for GLib) or a cast-emulating option in Dolly's toolchain, a
core decision. GLib also needs libffi: 3.5.2 (2025) added an Emscripten
wasm64 target, whose calls go through JavaScript (from memory, unchecked),
which Dolly's processes have not. Precedent: QEMU's Emscripten port (2025)
builds GLib for wasm64 and replaced GLib calls that cast function pointers
(`g_list_sort` and others); GLib's own issue is #3596, and wasm-vips keeps a
fork (searched 2026-10-15).

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
