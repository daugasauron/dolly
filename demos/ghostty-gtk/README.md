# Ghostty's GTK application on X11

In progress ([task](../../tasks/20261014-232500-ghostty-x11/TASK.md)):
Ghostty's own window, renderer and shell on Dolly's X server, over the GTK 4
stack of [the GTK demo](../gtk/README.md).

- [`libxev-dolly.patch`](libxev-dolly.patch): libxev, Ghostty's event loop at
  the commit Ghostty pins, has no backend for Emscripten. The patch adds
  `poll`: the epoll backend's loop with the loop's own registry of armed
  completions, handed to poll(2) each tick; Async through a pipe; Process
  through a thread that waits in waitpid. [`xev-check.zig`](xev-check.zig)
  uses them as Ghostty does; it printed `XEV-POLL-OK` in a session
  (2026-10-15), built with `zig build-exe -fno-single-threaded`, which needs
  the core Zig patch's thread fixes.
