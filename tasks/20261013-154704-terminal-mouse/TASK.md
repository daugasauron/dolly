# The display's terminal reports the mouse to no program: tmux's mouse does nothing

- STATUS: OPEN
- PRIORITY: 230
- TAGS: core,display,terminal,tmux

Found by [tmux in use](../20261013-133111-tmux-use/TASK.md) (2026-10-14), not fixed there.

Done when: a program that asks the terminal for mouse reports (`CSI ? 1000 h`
and the modes beside it, SGR encoding) gets them from the display's terminal
while it asks, and the terminal's own selection and scrollback are as before
whenever no program asks; shown by tmux (a click selects a pane, the wheel
scrolls one) in both browsers, with a test that fails before.

## As filed (2026-10-14, `integrate/round-1013` `0155af64`)

- Reproduce: `default`, `nena enable pty`, `amy install tmux`, `tmux -D &`,
  `tmux`, split a window, click in the other pane and type. The text goes to
  the pane that had the focus; the wheel scrolls nothing.
- tmux asks for the reports (`mouse` is on in this build) and gets none. The
  display's terminal keeps pointer and scroll records for itself, selection
  and scrollback ([input](../../docs/input.md), "Who reads the ring"), and
  under a full-screen program it has no scrollback to show.
- Where it lives: `src/ghostty/display.c`, the display library, which every
  image is built against (an image input). So it rides a catalog round and
  is not a night's change.
- Not known: whether Ghostty's terminal library already tracks the mouse
  modes a program sets and can encode a report (then this is a few lines in
  `display.c`), and what a user's selection does while a program has the
  mouse (terminals hold Shift for it).
