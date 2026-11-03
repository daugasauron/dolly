# Ghostty's GTK application on Ghostty 1.4: its OpenGL renderer needs Mesa's EGL

- STATUS: OPEN
- PRIORITY: 90
- TAGS: graphics,demo,zig

Found by the Zig 0.17 upgrade (`tasks/20261103-102041-zig017`), which moves Dolly's terminal to
Ghostty v1.4.0, the first release that builds with Zig 0.17 (no Ghostty commit builds with both
0.16 and 0.17: `minimum_zig_version` went from 0.16.0 to 0.17.0 in one merge, `3d07ef9e`,
2026-10-20).

`demos/ghostty-gtk` builds Ghostty's GTK application with `zig-llvm` over Mesa's GLX on Xlib with
softpipe (`Dollyfile-mesa-build`: `-Dglx=xlib -Degl=disabled`), and its `ghostty-dolly.patch` loaded
GTK's GLX context through `glXGetProcAddressARB`. Since ed350cbb ("renderer: share render
device state across renderers", 2026-09-29) Ghostty's OpenGL renderer makes its own EGL context per
surface (`src/renderer/opengl/Device.zig`: `EGL_PLATFORM_SURFACELESS_MESA`, or GTK's EGL display
when it has one, 4cd0eb5c), so Ghostty 1.4 on Dolly needs Mesa's EGL: the surfaceless platform with
softpipe, built static into the program as the GLX is now. The demo's patch needed a rebase too:
on v1.4.0 plus the core's patch, 7 of its 22 files were rejected even with fuzz. The Zig 0.17
branch rebased them by hand (the GLX context hunks dropped) and mapped `zig-packages.txt` to
v1.4.0's packages, so the staging runs; nothing of it was built in Dolly (no `zig-llvm` on LLVM
22 then, no EGL), so `ghostty-gtk` and `ghostty-x11` are expected to fail until this is done.

Mesa 26.2.5 refuses EGL beside the Xlib GLX the demo builds: "EGL requires DRI, but GLX is being
built with xlib support" (`meson.build:563`; EGL requires DRI, Haiku, Windows or Android, :562).
So the step is Mesa's DRI frontend with softpipe for both GLX and EGL (swrast over X11, the
surfaceless platform for Ghostty), which loads its gallium driver library at run time (`dso@0`,
which `ghostty-gtk` already requires), not a flag beside the current build.

Done when `ghostty-x11` opens Ghostty 1.4's window on Dolly's X server with a shell in it, in
Chromium and Firefox (`npm run test:demos -- ghostty-gtk`), with Ghostty's renderer drawing through
Mesa's EGL and softpipe, and no GLX context loaded by hand.
