# x11-libs is a view of x11-build, and gtk-build builds five more X libraries for itself

- STATUS: OPEN
- PRIORITY: 100
- TAGS: packages,audit,x11,0.1.9

## State (2026-11-17)

Done on `ws/packages`: `x11-libs` holds the build of X's client libraries (the Makefile, the
archives, xcb's generator in the python package, used for the build alone), with libXrandr,
libXcursor, libXdamage, libXcomposite and libXinerama, which `gtk-build` built by a script of its own
(their pins, staging and licence record moved from `demos/gtk` to `demos/x11`; their licences are
now kept). `x11-build` is `tools-build` with `python` and `x11-libs`. Dropped from x11-build: xcb's
protocol descriptions and generator, which no recipe reads beyond libxcb's build, and xorgproto's
`GL` headers, which no recipe includes (xorg-server builds without GLX).
`imgui-x11`'s SDL now finds Xcursor and XRandR beside the other X libraries and builds their
support, as upstream does by default: the example links them and carries their licences.

Built in `work/packages`: `x11-libs` (7,691,271 bytes against the view's 7,513,119, the five
libraries and their licences in it) and `x11-build` over it (245,944,820 bytes, with the
libpython that `3405a4c2e` put back in python).

Built in `work/packages`: `gtk-build` over the packages (371,121,626 bytes, 1,655 s): fontconfig's
Meson found expat 2.8.5 and gperf, GTK's libtiff-4 4.7.2, libjpeg 3.2.0 and the five X libraries,
libepoxy Mesa's `egl.pc`; its check links and runs a GTK program.

Tested: `demos/x11/test/x11-browser.mjs` on the x11-desktop built over them passed in Chromium and Firefox (xeyes, a drag, xterm, ImGui at 55 frames/s, tmux; `work/packages-evidence-1117/runs/test-x11.log`).

## Candidate

- Who installs it: x11-build and so every X program's build; x11-window, libxkbfile, PhotoCraft
  and Godot; sessions.
- What the consumers lose: GTK's build loses five libraries and their staging; a package that is a
  view of a toolchain becomes the build.
- Its own build: the Makefile x11-build had.
- Verdict: done.
