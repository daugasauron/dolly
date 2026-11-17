# Godot in Dolly takes no double click: the editor's FileSystem dock opens nothing

- STATUS: OPEN
- PRIORITY: 260
- TAGS: godot,input,bug,0.1.8

Found recording the Airtime video (2026-11-12, `work/videos-2026-11-12/godot-airtime/README.md`):
in `godot-airtime`'s editor a double click on `molten.gdshader` in the FileSystem dock (real X
clicks 90 ms apart, Chrome) selects the file and does not open it; Enter opens it.
`demos/godot/platform/display_server_dolly.cpp` builds `InputEventMouseButton` without ever
setting `double_click`, which the dock (and every Godot control that acts on a double click)
reads.

## State (2026-11-17)

On `fix/paste-touch`, written and not built: the next round builds Godot with it. Left: that
build, then `demos/godot/test/godot-editor-browser.mjs` in Chrome and Firefox.

v0.1.6's change (`read_pointer` marks a second press of the same button within 400 ms and 5
pixels `double_click`) times each press when the main thread reads it, once a frame. Where the
editor draws on the CPU (no WebGPU: the headless tests, a browser without it), a frame takes about
a second, so a double click is lost whenever a frame comes between its presses. Measured on
v0.1.7's godot-editor, headless, a project of four files, the clicks 90 ms apart unless named:

- After the editor has stood idle, as in `godot-editor-browser.mjs` after its click on the 2D
  tab: the page saw the first click read 18 ms after it was sent and the second, sent at 98 ms,
  only at 1077 ms. The dock selected `main.gd` and opened nothing, in Chrome at 90 ms and with
  the clicks back to back.
- With a click on the dock's empty part 3 s before, both presses mostly came while a frame was
  drawing, were read together and opened the file: in Chrome 4 of 4 on a mouse (90 ms twice,
  300 ms, Playwright's double click) and 1 of 1 on the touch-screen laptop (Blink settings: a
  coarse pointer beside a fine one); in Firefox 3 of 4 at 90 ms and 1 of 1 back to back on a
  mouse, 1 of 1 on the laptop (its preferences 1 and 7; in another run the editor ended with
  status 126 before the clicks); a finger's double tap on the laptop in Chrome (CDP touches
  150 ms apart) 1 of 3.

So a thread of the platform's own now waits for the page's records and stamps each with the time
it came; the main thread reads them at its next `process_events` and `read_pointer` times the
presses by those stamps (`demos/godot/platform/display_server_dolly.cpp`, `.h`). An X window's
records stay the main thread's, as Xlib's connection is. Checked with g++'s `-fsyntax-only`
(gnu++17) against Godot 4.7.2's headers; Dolly's clang has not compiled it.
`godot-editor-browser.mjs` now double-clicks `main.gd` after the 2D tab and waits for the script
editor: it fails on v0.1.7 for the reason above.

Done when a double click on a file in the FileSystem dock opens it in Chrome and Firefox, after the
editor has stood idle, in `demos/godot/test/godot-editor-browser.mjs`.
