# Ghostty's GTK application on X11

Ghostty's own window, renderer and shell on Dolly's X server
([task](../../tasks/20261014-232500-ghostty-x11/TASK.md)), over the GTK 4
stack of [the GTK demo](../gtk/README.md), every part built inside Dolly by
its own build: Mesa with Meson, libadwaita, and Ghostty by its `build.zig`
with Zig and LLVM built in Dolly ([zig](../zig/README.md)).

## Images

- `mesa`: Mesa's OpenGL through EGL's surfaceless platform, drawing with softpipe in the program, a library for programs the `cc` package builds (Ghostty, Godot); `gtk-build` installs it.
- `libadwaita`: libadwaita, GNOME's widgets and styles for GTK 4, a static library for GTK programs the `gtk-build` toolchain builds.
- `ghostty-gtk`: Ghostty's GTK application, a package; it needs an X server.

Open `/x11-desktop/` and, in its xterm, `amy install ghostty-gtk`, then
`ghostty &`: twm places Ghostty's window where the pointer clicks, drawn by
softpipe, with `$SHELL` in its terminal.

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
  integers. Softpipe has OpenGL 3.3 and the parts of 4.3 the renderer uses:
  the program tells Mesa to give it the 4.3 context it asks for
  (`MESA_GL_VERSION_OVERRIDE`, where GTK's own environment is set), so
  `ghostty` needs nothing set to start. Softpipe runs a shader per pixel in
  its interpreter, so the renderer shades as little as it can: the
  background color is the pass's clear color, a cell's background is a
  scissored clear, which shades nothing, and a frame draws only the rows
  whose cells differ from what its target shows, by a hash a row
  ([measured](#softpipe)).
- [`mesa-dolly.patch`](mesa-dolly.patch): Mesa's EGL and its gallium driver
  (softpipe) as static libraries linked into the program, and DRI, which EGL
  needs, without kernel modesetting. Ghostty renders each surface in its own
  EGL context on the surfaceless platform and hands GTK the pixels, which GTK
  draws with cairo: GTK finds no EGL or GLX library to open, so it uses no GL.
- [`translate-c-dolly.patch`](translate-c-dolly.patch): the build's tool.

- [`Dollyfile-mesa`](Dollyfile-mesa), [`Dollyfile-libadwaita`](Dollyfile-libadwaita),
  [`Dollyfile-ghostty-gtk`](Dollyfile-ghostty-gtk):
  the builds. libadwaita
  built static names its copies of five GTK builder helpers its own, and the
  program exports `adw_get_resource` and `adw_stylesheet_get_resource`, without
  which wasm-ld drops the constructors that register its resources. Zig hands
  its link to `cc` without the program's flags: the recipe's `cc` adds them
  (cast emulation, Mesa's driver, the X libraries). Ghostty's packages build
  with debug information unless they strip it: glslang's is stripped, as
  Ghostty strips its program, since clang 22 took over 8 GiB for its
  `SPIRV/doc.cpp` with it ([task](../../tasks/20261103-110119-ghostty-egl/TASK.md)).
- The package carries what GTK's libraries read as they start and a static
  link leaves out: GTK's settings schemas, compiled (the emoji chooser of a
  text field aborts without its own), and a fontconfig configuration for
  the fonts an image has in `/usr/share/fonts`.
- Made outside Dolly, as bootstrap exceptions: Mesa's parsers and scanners by
  the host's Bison and flex ([`prepare-mesa.sh`](prepare-mesa.sh)); Ghostty's
  Zig packages, fetched by the host's Zig
  ([`prepare-ghostty.sh`](prepare-ghostty.sh), [`zig-packages.txt`](zig-packages.txt));
  Ghostty's interface files, compiled by upstream into its signed release
  tarball, which its packaging guide asks distributions to build from.

## Softpipe

What the renderer's changes for softpipe gave, in a window of 102 by 37
cells (1020x777 pixels) on `x11-desktop` in Chromium, from a key's press to
the frame that shows it (2026-11-13; the machine's load was 15 on 16 cores):

| | Neovim, a full window of code | a shell |
| --- | --- | --- |
| cell backgrounds shaded over their rows | 1.2 s | 0.14 s |
| cell backgrounds as scissored clears | 0.43 s | 0.15 s |
| and only the rows that changed | 0.15 s | 0.09 s |

A window of 3,300 glyphs costs 0.38 s to shade, about 1.4 µs a pixel of a
glyph: that is what a whole redraw (a scroll, another screen) still takes.
Backgrounds no longer cost: a program that colours every cell of 514 by 155
(a Julia set, [the workbench video](../../tasks/20261112-223154-x11-workbench-video/TASK.md))
shows 36 to 40 frames a second.
