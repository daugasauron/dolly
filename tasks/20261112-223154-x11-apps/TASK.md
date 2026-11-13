# PhotoCraft and Godot install with amy and run on x11-desktop

- STATUS: CLOSED
- PRIORITY: 400
- TAGS: x11,godot,photocraft,amy,0.1.6,owner

Owner (2026-11-13): "as a separate task I want photocraft and godot to be installable and run on
x11." With 0.1.6.

## State (2026-11-13)

Decided: each program's own Dolly platform gets an X window, not upstream's X11 backends. Godot's
`platform/linuxbsd` X11 display server and winit's X11 backend draw through GLX, EGL on X or
Vulkan, which Dolly's Mesa (surfaceless EGL, softpipe) and the browser do not have; frames have to
reach Dolly's X server as pixels (core `PutImage`: no MIT-SHM, DRI or GLX here), and a WebGPU
canvas shown over the X server's frame where a window is would be two mechanisms made to look like
one. So:

- `x11-window` (demos/x11, a package): a C library over Xlib, a program's window on the server
  DISPLAY names whose records are `input@0`'s (keys named as a browser names them, from the evdev
  keycodes and keysyms; pointer, wheel, focus, presence) plus its size and the window manager's
  close; frames go in by `XPutImage` and are shown again on Expose; cursor shapes from the cursor
  font; centred with a user position, as SDL places a window, so twm does not ask where.
- Godot (`display_server_dolly.cpp`): where `DISPLAY` is set the window is an X window; frames of
  RenderingDevice are drawn into a texture of the swap chain's and read back after each submit
  (`rendering_device_driver_webgpu.cpp`, the scope opened without a page surface), those of the
  Compatibility renderer read back from GL as before.
- PhotoCraft: winit's Dolly platform opens an X window and reads its records on its thread; wgpu's
  Dolly backend gives an X window's surface a texture of its own, copied out and read back at each
  present (`DollyWindowHandle.x11` names the window to it). The package carries the Great Wave
  (`/usr/share/photocraft/pictures`) so `amy install photocraft` has a photo to open.

Measured on x11-desktop in the build of 08:56 (Godot's template): `amy install godot` enables
`threads@0`, `gpu@0` and `clipboard@0` through nena, and a script's window (a label) opened
centred and framed by twm, drawn by the Compatibility renderer (Chrome headless, SwiftShader) and
by Forward+ on gpu@0 read back (Chrome on the NVIDIA GPU); keys with Shift and Ctrl, arrows, F5,
Escape, a click and the wheel reached its window, and twm's Delete closed it, its log clean.

`demos/godot/test/godot-x11-browser.mjs` passed in Chrome and Firefox (round of 09:35, before
the fix below): from a fresh x11-desktop, `amy install godot-editor lantern-drift` and
`lantern-drift` open the game's window (1280 by 720, centred) 16 to 24 s after the command; the X
server showed 20.8 frames a second of its title in Chrome and 33.2 in Firefox (NVIDIA RTX 5070,
frames read back from gpu@0 and put with `XPutImage`); Enter started a flight; twm's Delete
closed it; `godot-editor -e` drew Lantern Drift's project 59 s after the command, the islands in
its 3D view, and closed at Delete. Logs: `build/godot-x11-chromium.log`,
`build/godot-x11-firefox.log`, screenshots `build/godot-x11-*.png`.

Fixed after that run: Dolly's display package sets `DISPLAY` to the terminal's display library
(`/usr/lib/libdisplay.so`), which Godot and PhotoCraft took for an X server on the page; an X
display is one with a colon (`x11_window_display`). The editor's window ran off the screen: it
asks to be maximized, which on twm now leaves it a window.

Found: on x11-desktop the page's Ctrl+C is still the terminal's interrupt key and ends the X
server: the workbench branch makes Xsdl clear `ISIG` (`20261112-223154-x11-workbench`); until it
is merged, Ctrl+C copies nothing there.

On the build of 10:28 the Godot test passed again in Chrome and Firefox: Lantern Drift's window
drew 12 and 10 s after the command, the X server showed 30.8 and 53.6 frames a second of it, and
the editor's window drew 51 s after its command. Its screenshots showed red and blue swapped:
Dolly's Xsdl draws on the page's RGBA surface, so its visual has red in the low byte, and
`x11-window` put frames in blue first. It now follows the visual's masks, and the test checks
that the game's sunset has more red than blue.

On the build of 11:57 with that fix the Godot test passed in Chrome and Firefox: the game's
window drew 12 and 14 s after the command, with twice as much red as blue (2.03, 1.98), the X
server showed 28.2 and 49.0 frames a second of it, and the editor's window drew 53 s after its
command, its colours its own (`build/godot-x11-editor-chromium.png`). Logs
`build/godot-x11-chromium.log`, `build/godot-x11-firefox.log`.

PhotoCraft, on its build of 13:37 (`photocraft-cli` now links x11-window through wgpu's backend,
which presents to an X window): `demos/photocraft/test/photocraft-x11-browser.mjs` passed in
Chrome and Firefox: `amy install photocraft` and `photocraft` on the Great Wave drew its window 21
and 23 s after the command, in its own colours (`build/photocraft-x11-chromium.png`); Ctrl+I's
inverted picture showed within a frame, a drag of the title bar moved it 200 pixels
(`build/photocraft-x11-moved-chromium.png`), and twm's Delete closed it after PhotoCraft asked to
save, with no panic in its log. Logs `build/photocraft-x11-{chromium,firefox}.log`.

Not done: twm shows PhotoCraft's title with its em dash as other characters (x11-window stores
the UTF-8 title in `WM_NAME`, whose type is Latin-1 text); resizing with the window manager was not tried.

## Do

In `x11-desktop`, `amy install` each (the editor and a game for Godot, PhotoCraft with its
photos), and each opens as a window of the X session that takes the keyboard and the mouse, moves,
resizes and closes with the window manager. Decide per program how it draws there (an X11 display
server or windowing backend over Dolly's X server, with a renderer that works in it), measure that
it is usable, and keep the page-canvas images as they are.

## Done when

In Chrome and Firefox: from a fresh `x11-desktop`, `amy install` and the program's command open a
window of Godot's editor, a Godot game, and PhotoCraft with a photo; each takes input and closes;
a browser test for each.

## Closed (2026-11-13, `feature/x11-apps`)

Done when holds: from a fresh `x11-desktop`, `amy install` and the command open windows of
Godot's editor and Lantern Drift (`godot-x11-browser.mjs`) and PhotoCraft with the Great Wave
(`photocraft-x11-browser.mjs`), each takes keys or the pointer and closes at twm's Delete, in
Chrome and Firefox. The title's em dash is left above.
