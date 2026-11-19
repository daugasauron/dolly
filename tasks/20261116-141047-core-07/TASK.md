# DISPLAY names the terminal's display library in every image: upstream programs take it for an X server, and ports test for a colon

- STATUS: OPEN
- PRIORITY: 140
- TAGS: audit,core,display,0.1.8

From the core audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at `b09b1e243`).

## State (2026-11-19)

The change below is in the 0.1.8 integration (`ws/modules`), and the round `dolly-round-018k`
(`work/integrate-018`, 8d666a4e4) built the catalog with it. In that round's images, `default`'s
`/etc/dolly/environment` holds `DOLLY_DISPLAY_LIBRARY=/usr/lib/libdisplay.so` and no `DISPLAY`
(the released one, `work/round1113`, held `DISPLAY=/usr/lib/libdisplay.so`); no recipe of the
catalog exports `DISPLAY`. `test/zig-sdk.artifacts.mjs` now checks that `default`'s environment
holds no `DISPLAY` (it fails on the released image).

Which ports read `DISPLAY` in the guest, and what they do now:
- `x11_window_display()` (`demos/x11/x11-window/`): Godot's and PhotoCraft's platforms open the
  page's canvas without `DISPLAY` and an X window where x11-desktop exports `DISPLAY=:0`.
- SDL2's X11 driver (`sdl2-x11`, `imgui-x11`) and GTK's X11 backend (`gtk`, `ghostty-gtk`): X
  clients run on x11-desktop's `:0`; elsewhere `XOpenDisplay(NULL)` fails as it did with the
  library's path.
- Blender (`GHOST_SystemDolly`, its X11 and Wayland systems off) and Wine (`winedolly.drv`) read
  no `DISPLAY`. The terminal (Ghostty's `libdisplay.so`) is display@0's `DOLLY_DISPLAY_LIBRARY`.

The round's suites stage passed the display, terminal and default suites in Chrome and Firefox.
Left for its gpu stage (a hardware adapter on its X display): Godot and PhotoCraft on
x11-desktop (`demos/godot/test/godot-x11-browser.mjs`,
`demos/photocraft/test/photocraft-x11-browser.mjs`); when both pass, this closes.

## The change (2026-11-17)

Done on `ws/modules`: display@0's kernel side reads the library's path from
`DOLLY_DISPLAY_LIBRARY` (`host/display/kernel.c`, the contract's comment and `display.h`'s,
so display@0's ABI digest changes), which `Dollyfile-display` and `Dollyfile-ghostty-build`
export; `DISPLAY` is left unset, as on a Unix system without X, and `x11-desktop` sets
`DISPLAY=:0` for its clients. `x11_window_display()` returns `getenv("DISPLAY")` (the colon
test is gone, `demos/x11/x11-window/`), which Godot's and PhotoCraft's platforms call.
Rebuilds every image with display@0's client or the display package: the round's.

Verified on `ws/modules` (the core's images rebuilt): in `default`, a program sees no
`DISPLAY` (`printf '[%s]' "$DISPLAY"` prints `[]`, where the released one printed
`[/usr/lib/libdisplay.so]`) and `DOLLY_DISPLAY_LIBRARY` is `/usr/lib/libdisplay.so`; the boot
log says `dolly: preparing sandbox display library /usr/lib/libdisplay.so`; the probe
(`work/modules/build/modules-display-env-probe.mjs`), `test/display-browser.mjs` and
`test/terminal-browser.mjs` pass in Chromium and Firefox. Left for the 0.1.8 round, which
builds the heavy chains: on `x11-desktop`, Godot and PhotoCraft open X windows through
`x11_window_display()` without the colon test (`demos/x11/test/`, `demos/godot/test/`,
`demos/photocraft/test/`), and the default suite in a tree with the whole catalog.

## Found

`Dollyfile-display:34` and `Dollyfile-ghostty-build:184` export `ENV DISPLAY
/usr/lib/libdisplay.so`, and display@0's kernel side reads it to find the terminal's resident
library (`host/display/kernel.c:226`; the contract says so, `host/display/dolly-display-0.wat:7`,
`display.h:205`). Every image that installs the display package hands it to every program:
`printf '[%s]' "$DISPLAY"` in the released `default` prints `[/usr/lib/libdisplay.so]`
(`work/audit-1116-evidence/core/probes/display-env-probe.mjs`, `display-env-probe.log`).

`DISPLAY` is the X11 display name every Unix program reads to decide whether a window system is
there. AGENTS.md: "Report unsupported capabilities accurately so upstream selects its fallbacks";
"Prefer unchanged upstream source plus target/toolchain configuration over ... per-program
compatibility patches". It has cost ports already: Godot and PhotoCraft took the value for an X
server (`tasks/20261112-223154-x11-apps`, "which Godot and PhotoCraft took for an X server on the
page"), and the fix was a test in the ports' shared X helper,
`demos/x11/x11-window/x11-window.c:81-84` ("an X display is one with a colon"), which
`demos/godot/platform/display_server_dolly.cpp:504` and
`demos/photocraft/platform/winit/window.rs:92` call. Other upstream code that checks only
whether `DISPLAY` is set sees a display that is not there. Measured in the released
`python-data` (`display-python-probe.mjs`, `display-python-probe.log`): matplotlib chooses `agg`
and `webbrowser` registers no browser both with Dolly's `DISPLAY` and without it, since no GUI
toolkit or browser is installed; the rest of the catalog was not surveyed.

## Do

The kernel reads the library's path from a name of its own (`DOLLY_DISPLAY_LIBRARY`, in the
display package's `EXPORTS ENV` and the contract's comment) and `DISPLAY` is left unset, as on a
Unix system without X; `x11-desktop` keeps exporting `DISPLAY=:0` for its clients.
`x11_window_display` can then return `getenv("DISPLAY")` as upstream code does.

## Done when

In a rebuilt `default`, `DISPLAY` is unset and the terminal draws; on `x11-desktop`, Godot and
PhotoCraft open X windows with the colon test gone; the display and default suites pass in
Chromium and Firefox.
