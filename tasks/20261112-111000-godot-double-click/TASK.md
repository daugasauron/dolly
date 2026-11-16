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

## State (2026-11-16, the audit)

The change is in v0.1.6 and v0.1.7 (`demos/godot/platform/display_server_dolly.cpp:312` sets
`double_click`). Not checked: no Godot test double-clicks (`git grep -i "dblclick\|double"
demos/godot/test/` finds nothing), so the done-when's check in `godot-gpu-browser.mjs` is still to
write. Left: that check, in Chrome and Firefox.

## Done on `fix/batch` (2026-11-12)

`read_pointer` marks a second press of the same button within 400 ms and 5 pixels
`double_click`, as `DisplayServerX11` does (syntax-checked with Dolly's clang against Godot
4.7.2's headers). Godot builds with it in the batch round.

## Do

Set `double_click` as Godot's other platforms do: the second press of the same button within the
system's double-click time and distance (X11's `DisplayServerX11` keeps the last press's time and
position), or from the input@0 event if the page reports the browser's click count.

## Done when

A double click on a file in the FileSystem dock opens it in Chrome and Firefox, in
`demos/godot/test/godot-gpu-browser.mjs`.
