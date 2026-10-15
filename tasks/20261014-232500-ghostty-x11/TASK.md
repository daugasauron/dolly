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

## State (2026-10-15, 09:10): X11 runs; Ghostty's build.zig builds libghostty-vt; GTK is next

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
   libffi: Dolly has one already (corrected 2026-10-15): CPython's
   `demos/python/libffi-dolly.c` makes calls and closures through dso@0's
   FFI operations, and ctypes callbacks pass in the Python test. GObject
   needs only `ffi_call` (`gobject/gclosure.c`, GLib 2.86.0), so the step
   is to make that libffi a package of its own. Precedent: QEMU's Emscripten port (2025) builds GLib for wasm64 and
   replaced GLib calls that cast function pointers (`g_list_sort` and
   others); GLib's issue is #3596, and wasm-vips keeps a fork (searched
   2026-10-15).
3. OpenGL without a GPU: Ghostty's renderer needs OpenGL 4.3
   (`MIN_VERSION_*` in `src/renderer/OpenGL.zig` at the pinned commit; read
   2026-10-15), drawn in GTK's `GtkGLArea`. Mesa's software "xlib" driver does GL in the client and sends
   finished frames as images, so the X server needs no GL (from memory,
   unchecked), with softpipe as the rasterizer: llvmpipe generates machine
   code at run time, which a Wasm process cannot run.
4. Ghostty: `zig build` runs in Dolly ([Zig with LLVM](../20261014-234000-zig-llvm/TASK.md),
   package `zig-llvm`). Upstream's unmodified `build.zig` at the pinned
   commit, `zig build -Demit-lib-vt=true` in a session (scratch probe in
   `work/zig`, 2026-10-15 05:25), built `zig-out/lib/libghostty-vt.a`
   (20.7 MB, Debug) in 127 s: the build runner, uucode's table generator,
   translate-c and the library, all compiled by Zig in Dolly. The packages
   (uucode and six lazy ones) were fetched on the host into the project's
   `zig-pkg/`: a session reaches no network but the broker, and Zig's own
   fetch fails there with NameServerFailure. The step that failed is
   Ghostty's browser module (`ghostty-vt.wasm`, "unsupported arch" in
   `std/start.zig`), which Dolly does not need. Fixed on the way, in the
   demo's Zig patch (on `main`, `8edcaa0d`): a file placed without
   replacing (Dolly has no hard links), the compiler's stack (48 MB, as
   upstream), Emscripten's `NAME_MAX`. Next: the GTK application, with its
   C dependencies compiled by Zig.
   Threads exist (`threads@0`) for its renderer and IO threads.
5. What Ghostty's GTK front end needs at the pinned commit (read
   2026-10-15): GTK4 and libadwaita, both linked unconditionally; from a
   git checkout, `blueprint-compiler` 0.16 or newer for its `.ui` files
   (release tarballs ship them generated), which reads the Gtk and Adw
   typelibs; `src/Command.zig` starts the shell with `fork`, which Dolly
   has not, so it needs a spawn path; its event loop is libxev (which
   backend serves Emscripten is not checked). Size: GLib, the X11 client
   libraries GTK4 uses, cairo, pango, harfbuzz, fribidi, fontconfig,
   freetype, pixman, graphene, libepoxy, gdk-pixbuf, GTK4, libadwaita, Mesa
   and Ghostty's patches. This is the largest port Dolly has taken on;
   each library is a step that can be verified on its own.
