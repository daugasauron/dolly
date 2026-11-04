# Ghostty's GTK application on X11

Ghostty's own window, renderer and shell on Dolly's X server
([task](../../tasks/20261014-232500-ghostty-x11/TASK.md)), over the GTK 4
stack of [the GTK demo](../gtk/README.md), every part built inside Dolly by
its own build: Mesa with Meson, libadwaita, and Ghostty by its `build.zig`
with Zig and LLVM built in Dolly ([zig](../zig/README.md)).

## Images

- `mesa-build`: A build stage: Mesa's OpenGL through EGL's surfaceless platform, drawing with softpipe, over `gtk-build`.
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
  reset Ghostty's post-fork hook does as spawn attributes; Dear ImGui's GL
  backend built for desktop GL, which it assumes is WebGL on Emscripten, and
  EGL's native types as pointers where its header would take Emscripten's
  integers. Softpipe runs a shader per pixel in its interpreter, so the renderer clears
  to the background color instead of shading it and
  shades cell backgrounds only over the rows that have one: a frame of a
  shell took 410 ms, now 51 ms, and a key's echo appears 65 ms after the key
  instead of 0.7 s (Chromium, 2026-10-16).
- [`mesa-dolly.patch`](mesa-dolly.patch): Mesa's EGL and its gallium driver
  (softpipe) as static libraries linked into the program, and DRI, which EGL
  needs, without kernel modesetting. Ghostty renders each surface in its own
  EGL context on the surfaceless platform and hands GTK the pixels, which GTK
  draws with cairo: GTK finds no EGL or GLX library to open, so it uses no GL.
- [`translate-c-dolly.patch`](translate-c-dolly.patch): the build's tool.

- [`Dollyfile-mesa-build`](Dollyfile-mesa-build), [`Dollyfile-ghostty-gtk`](Dollyfile-ghostty-gtk),
  [`Dollyfile-ghostty-x11`](Dollyfile-ghostty-x11): the build. libadwaita
  built static names its copies of five GTK builder helpers its own, and the
  program exports `adw_get_resource` and `adw_stylesheet_get_resource`, without
  which wasm-ld drops the constructors that register its resources. Zig hands
  its link to `cc` without the program's flags: the recipe's `cc` adds them
  (cast emulation, Mesa's driver, the X libraries). Ghostty's packages build
  with debug information unless they strip it: glslang's is stripped, as
  Ghostty strips its program, since clang 22 took over 8 GiB for its
  `SPIRV/doc.cpp` with it ([task](../../tasks/20261103-110119-ghostty-egl/TASK.md)).
- Made outside Dolly, as bootstrap exceptions: Mesa's parsers and scanners by
  the host's Bison and flex ([`prepare-mesa.sh`](prepare-mesa.sh)); Ghostty's
  Zig packages, fetched by the host's Zig
  ([`prepare-ghostty.sh`](prepare-ghostty.sh), [`zig-packages.txt`](zig-packages.txt));
  Ghostty's interface files, compiled by upstream into its signed release
  tarball, which its packaging guide asks distributions to build from.
