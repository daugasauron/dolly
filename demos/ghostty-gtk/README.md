# Ghostty's GTK application on X11

Ghostty's own window, renderer and shell on Dolly's X server
([task](../../tasks/20261014-232500-ghostty-x11/TASK.md)), over the GTK 4
stack of [the GTK demo](../gtk/README.md), every part built inside Dolly by
its own build: Mesa with Meson, libadwaita, and Ghostty by its `build.zig`
with Zig and LLVM built in Dolly ([zig](../zig/README.md)).

## Images

- `mesa-build`: A build stage: Mesa's OpenGL with GLX over Xlib, drawing with softpipe, and libepoxy taking it from the program, over `gtk-build`.
- `ghostty-gtk`: Ghostty's GTK application, a package; it needs an X server.
- `ghostty-x11`: An application: Ghostty's window on Dolly's X server, with Slop and amy in its terminal.

Open `/ghostty-x11/`: Ghostty's window, drawn by softpipe, with Slop in its
terminal and amy to install packages into the session (`amy install tmux`).
`kill $(cat /tmp/.X0-pid)` in its shell ends the server and returns to the
terminal's.

## Key files

- [`libxev-dolly.patch`](libxev-dolly.patch): libxev, Ghostty's event loop at
  the commit Ghostty pins, has no backend for Emscripten. The patch adds
  `poll`: the epoll backend's loop with the loop's own registry of armed
  completions, handed to poll(2) each tick; Async through a pipe; Process
  through a thread that waits in waitpid. [`xev-check.zig`](xev-check.zig)
  uses them as Ghostty does; it printed `XEV-POLL-OK` in a session
  (2026-10-15), built with `zig build-exe -fno-single-threaded`, which needs
  the core Zig patch's thread fixes.
- [`ghostty-dolly.patch`](ghostty-dolly.patch), over the core's
  [`ghostty-dolly.patch`](../../config/ghostty-dolly.patch): Emscripten next to Linux
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

- [`Dollyfile-mesa-build`](Dollyfile-mesa-build), [`Dollyfile-ghostty-gtk`](Dollyfile-ghostty-gtk),
  [`Dollyfile-ghostty-x11`](Dollyfile-ghostty-x11): the build. libadwaita
  built static names its copies of five GTK builder helpers its own, and the
  program exports `adw_get_resource` and `adw_stylesheet_get_resource`, without
  which wasm-ld drops the constructors that register its resources. Zig hands
  its link to `cc` without the program's flags: the recipe's `cc` adds them
  (cast emulation, Mesa's GLX, the X libraries).
- Made outside Dolly, as bootstrap exceptions: Mesa's parsers and scanners by
  the host's Bison and flex ([`prepare-mesa.sh`](prepare-mesa.sh)); Ghostty's
  Zig packages, fetched by the host's Zig
  ([`prepare-ghostty.sh`](prepare-ghostty.sh), [`zig-packages.txt`](zig-packages.txt));
  the typelibs blueprint-compiler reads, from Arch Linux's packages
  ([`prepare-typelibs.sh`](prepare-typelibs.sh), [`typelib-packages.txt`](typelib-packages.txt)).
