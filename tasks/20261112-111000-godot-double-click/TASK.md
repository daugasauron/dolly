# Godot in Dolly takes no double click: the editor's FileSystem dock opens nothing

- STATUS: OPEN
- PRIORITY: 260
- TAGS: godot,input,bug

Found recording the Airtime video (2026-11-12, `work/videos-2026-11-12/godot-airtime/README.md`):
in `godot-airtime`'s editor a double click on `molten.gdshader` in the FileSystem dock (real X
clicks 90 ms apart, Chrome) selects the file and does not open it; Enter opens it.
`demos/godot/platform/display_server_dolly.cpp` builds `InputEventMouseButton` without ever
setting `double_click`, which the dock (and every Godot control that acts on a double click)
reads.

## Do

Set `double_click` as Godot's other platforms do: the second press of the same button within the
system's double-click time and distance (X11's `DisplayServerX11` keeps the last press's time and
position), or from the input@0 event if the page reports the browser's click count.

## Done when

A double click on a file in the FileSystem dock opens it in Chrome and Firefox, in
`demos/godot/test/godot-gpu-browser.mjs`.
