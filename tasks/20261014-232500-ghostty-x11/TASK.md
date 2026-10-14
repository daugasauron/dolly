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

## State (2026-10-15, 04:15): X11 and zig build run; GTK is next

Each step needs the one before it; details from memory are marked.

1. X11 on Dolly: done and on `main` (`demos/x11`, [windows](../20261014-211501-windows/TASK.md)):
   Xsdl, twm, xclock, xeyes, xterm, and SDL2 programs through SDL's X11
   driver (`imgui-x11`).
2. GTK on X11: a GTK3 application, then GTK4 and its libraries built inside
   Dolly. Ghostty's Linux front end is GTK4 (from memory). The X11 port's
   estimate (not tried): GLib, cairo, pango, harfbuzz, fribidi, fontconfig,
   gdk-pixbuf and libepoxy with Meson; xcb render/shm, Xrandr, Xcursor,
   Xinerama, Xcomposite and Xdamage; `threads@0` for GLib; RandR in the
   server's SDL output. The likely long pole is calls through function
   pointers of another type, which trap in WebAssembly: GObject's signal
   handlers, and SDL's own `XFixesSelectSelectionInput` already did
   (`imgui-x11` builds SDL without XFixes). That needs patches or a
   cast-emulating option in Dolly's toolchain, a core decision. GLib needs
   libffi: 3.5.2 (2025) added an Emscripten wasm64 target, whose calls go
   through JavaScript (from memory, unchecked), which Dolly's processes have
   not. Precedent: QEMU's Emscripten port (2025) builds GLib for wasm64 and
   replaced GLib calls that cast function pointers (`g_list_sort` and
   others); GLib's issue is #3596, and wasm-vips keeps a fork (searched
   2026-10-15).
3. OpenGL without a GPU: Ghostty's Linux renderer needs OpenGL 3.3 (from
   memory). Mesa's software "xlib" driver does GL in the client and sends
   finished frames as images, so the X server needs no GL (from memory,
   unchecked), with softpipe as the rasterizer: llvmpipe generates machine
   code at run time, which a Wasm process cannot run.
4. Ghostty: `zig build` runs in Dolly ([Zig with LLVM](../20261014-234000-zig-llvm/TASK.md),
   package `zig-llvm`), so Ghostty's own `build.zig` can be tried; its C
   dependencies would be the first test of C compiled by Zig in Dolly.
   Threads exist (`threads@0`) for its renderer and IO threads.
