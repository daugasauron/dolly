# PhotoCraft and Godot install with amy and run on x11-desktop

- STATUS: OPEN
- PRIORITY: 400
- TAGS: x11,godot,photocraft,amy,0.1.6,owner

Owner (2026-11-13): "as a separate task I want photocraft and godot to be installable and run on
x11." With 0.1.6.

## State (2026-11-13)

Filed. Today both draw on the page's own surface: Godot through `platform/dolly`'s display server
on `gpu@0` (or the Compatibility renderer on Mesa), PhotoCraft through its winit and wgpu
platforms (`demos/photocraft/platform`). On `x11-desktop` a program is a window of the X server
Dolly runs (`demos/x11`), as xterm, xclock and Ghostty are.

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
