# Shortcuts and selection on the Wine desktop

- STATUS: CLOSED
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

## Done (2026-10-10), except moving a shortcut and the cursor follow-up (done by the coordinator)

`demos/wine/programs/desktop/desktop.c`: a window of class `Progman` over the work area, which
answers `WM_WINDOWPOSCHANGING` with `HWND_BOTTOM` so that it stays under every other window when the
driver or Wine raises it on a click, and ignores `WM_CLOSE`. In it a comctl32 list view
(`LVS_ICON | LVS_ALIGNLEFT | LVS_AUTOARRANGE`) in the desktop's colour.

- Wine's (the list view): drawing icon and label, the highlight, selecting by click, the rubber
  band and what it touches, Ctrl+click, arrow keys, the activation notice.
- Ours: the list of programs, now one list for the Start menu and the shortcuts; each program's
  first `RT_GROUP_ICON` resource (`EnumResourceNames` on its module), `IDI_APPLICATION` for an
  x86-64 file, whose own icon is not read; starting the focused item on `LVN_ITEMACTIVATE` (the
  control names the item only for a double click, not for Enter, so the focused one is asked for).

Measured in Chrome by the test (first session): six cells of the column each hold more than 300
pixels that are not the desktop's colour; a click on the first highlights it alone (pixels of
`COLOR_HIGHLIGHT` in its cell); a click on the empty desktop clears it; a drag from 300,200 to 5,5
selects the first three and not the fourth; Ctrl+click adds the fourth; a double click on Notepad's
shortcut opens Notepad; Enter on WineMine's selected shortcut opens WineMine. The rest of the test
(windows over the desktop, taskbar, Start menu) passes unchanged.

- Moving a shortcut by dragging: not done; with `LVS_AUTOARRANGE` the control keeps the column.
- The cursor: the pointer over the desktop is now over this window, so Wine's own `WM_SETCURSOR`
  answers "arrow" there and the test's "arrow over the desktop" is that. The driver's rule for the
  bare desktop still applies when a program runs without the shell (`wine netsurf` from the
  terminal), which the test does not exercise.
- Once in six runs the file-manager part of the test saw the desktop list Notepad without the file
  manager's window for a moment (`GetWindowText` of another thread's window, most likely); the run
  failed on a title it then missed. A pause before leaving the subdirectory made three runs pass.

`wine` snapshot 179,050,134 bytes (179,048,487 before); built in 185.6 s; the test takes 65 s.
