# Ghostty's GTK application on X11

In progress ([task](../../tasks/20261014-232500-ghostty-x11/TASK.md)):
Ghostty's own window, renderer and shell on Dolly's X server, over the GTK 4
stack of [the GTK demo](../gtk/README.md).

It ran in a session (2026-10-15), built there by hand: Ghostty's `zig build`
with `-Dapp-runtime=gtk`, its window with libadwaita's header bar, its OpenGL
renderer on Mesa's softpipe through GLX, and `/bin/slop` on a pseudo-terminal
answering a command typed into the window. The recipes are not written yet.

- [`libxev-dolly.patch`](libxev-dolly.patch): libxev, Ghostty's event loop at
  the commit Ghostty pins, has no backend for Emscripten. The patch adds
  `poll`: the epoll backend's loop with the loop's own registry of armed
  completions, handed to poll(2) each tick; Async through a pipe; Process
  through a thread that waits in waitpid. [`xev-check.zig`](xev-check.zig)
  uses them as Ghostty does; it printed `XEV-POLL-OK` in a session
  (2026-10-15), built with `zig build-exe -fno-single-threaded`, which needs
  the core Zig patch's thread fixes.
- [`ghostty-dolly.patch`](ghostty-dolly.patch): Emscripten next to Linux
  where Ghostty's code names platforms (home directory, keycodes, links);
  the shell started by `posix_spawn`, Dolly having no fork, with the signal
  reset Ghostty's post-fork hook does as spawn attributes; GTK's GL context
  loaded through the linked `glXGetProcAddressARB`, there being no libGL to
  open; Dear ImGui's GL backend built for desktop GL, which it assumes is
  WebGL on Emscripten.
- [`mesa-dolly.patch`](mesa-dolly.patch), [`epoxy-dolly.patch`](epoxy-dolly.patch):
  Mesa's GLX over Xlib with softpipe, linked into the program, and libepoxy
  finding it by a weak symbol. libepoxy keeps EGL too (GTK refers to it; it
  only probes for libEGL).
- [`translate-c-dolly.patch`](translate-c-dolly.patch),
  [`blueprint-compiler-dolly.patch`](blueprint-compiler-dolly.patch): the
  build's tools.

For the recipes, from the session: libadwaita built static needs
`-D_gtk_builder_*=adw_gtk_builder_*` for the five GTK helpers it copies, and
a program keeps its resources only if it exports `adw_get_resource` and
`adw_stylesheet_get_resource` (wasm-ld keeps a constructor only in an object
something keeps); GLib's resource compiler needs `xmllint` (libxml2); the
GObject cast emulation runs after Zig's link. Bootstrap exceptions: Bison and
flex outputs for Mesa's parsers made on the host, and the Gtk and Adw
typelibs blueprint-compiler reads.
