# Mesa is a build stage over GTK's, so Godot builds on GTK's whole stack for Mesa alone

- STATUS: OPEN
- PRIORITY: 100
- TAGS: packages,audit,0.1.9

## State (2026-11-17)

Done on `ws/packages`: `mesa-build`, a toolchain `FROM gtk-build`, is now the `mesa` package
(`demos/ghostty-gtk/Dollyfile-mesa`): the same Meson build with the same options and its EGL check,
`FROM system-tools` with the meson and pkgconf packages for the build, keeping libEGL, the gallium
driver, the EGL, KHR and GL headers and two `.pc` files. `gtk-build` installs it, in place of the
Khronos headers it staged from Mesa's archive; `ghostty-gtk` builds `FROM gtk-build`; `godot` and
`godot-editor` build `FROM system-tools` with the `mesa` and `x11-libs` packages, no longer on GTK.

Godot is a heavy chain this tree does not build: the next round builds `godot`, `godot-editor` and
the games on it and runs their tests.

Built in `work/packages`: `mesa` (34,876,198 bytes against mesa-build's 358 MB, 533 s; Meson finds
the same dependencies as in mesa-build's log and its EGL check draws with softpipe).

Built in `work/packages`: `gtk-build` over the packages (371,121,626 bytes, 1,655 s): fontconfig's
Meson found expat 2.8.5 and gperf, GTK's libtiff-4 4.7.2, libjpeg 3.2.0 and the five X libraries,
libepoxy Mesa's `egl.pc`; its check links and runs a GTK program.

## Candidate

- Who installs it: GTK's build (headers), Ghostty, Godot; sessions with a GL program.
- What the consumers lose: Godot's builds depend on X's libraries and Mesa instead of the GTK
  stack (a GTK change rebuilt Godot); one toolchain fewer.
- Its own build: Mesa's Meson, softpipe, EGL's surfaceless platform, static.
- Verdict: done.
