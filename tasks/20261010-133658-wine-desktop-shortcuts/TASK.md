# Shortcuts and selection on the Wine desktop

- STATUS: OPEN
- PRIORITY: 130
- TAGS: wine,demo

Owner (2026-10-10): "I want the desktop in wine to feel more like a desktop. I want there to be some
shortcuts there to programs and I want to be able to click/drag to select things."

In the desktop shell (`demos/wine/programs/desktop`), after NetSurf and the file manager, as its
own commit and report:

- Shortcuts for the image's programs (Notepad, Paint, WineMine, NetSurf, the file manager, the
  x86-64 examples if they fit): an icon with its name under it, in a column from the top left. Each
  program's own icon resource where it has one. Double-click, and Enter on a selected one, starts
  it as the Start menu does.
- Selection: a click selects one (highlighted icon and label), a click on empty desktop clears it,
  dragging on empty desktop draws a rubber band and selects what it touches, Ctrl+click toggles.
  Dragging a shortcut to move it if cheap; positions need not persist.
- Windows over it, the taskbar and the Start menu keep working; it redraws correctly when windows
  move over the icons.

Test: read the icons' pixels, select one by click and several by a drag rectangle (read the
highlight), start a program by double-click. Say which parts are Wine's (a comctl32 list view, if
used) and which are ours.

Later, when the display contract's cursor list is extended on `main` (the coordinator's work): the
driver's `DOLLY_SetCursor` mapping, resize arrows on window edges, and a test. Not to be started
before that, and no software cursor.
