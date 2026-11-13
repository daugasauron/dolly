# PhotoCraft and Godot install with amy and run on x11-desktop

- STATUS: OPEN
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

Found: on x11-desktop the page's Ctrl+C is still the terminal's interrupt key and ends the X
server: the workbench branch makes Xsdl clear `ISIG` (`20261112-223154-x11-workbench`); until it
is merged, Ctrl+C copies nothing there.

Left: the editor, Lantern Drift and PhotoCraft in Chrome and Firefox
(`demos/godot/test/godot-x11-browser.mjs`, `demos/photocraft/test/photocraft-x11-browser.mjs`).

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
