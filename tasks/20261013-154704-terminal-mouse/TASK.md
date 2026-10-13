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

## State (2026-10-14, 04:00): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read `main`, the
pinned Ghostty source and tmux 3.8's, and changed nothing (one report in two
parts; the other is
[who holds a terminal](../20261013-154704-terminal-holder/investigation.md)).
The integrator checked that the display library has no line about the
mouse, that Ghostty's headers declare a mouse encoder, and the two recipes'
rows. It gives no verdict. What it found:

- The two "not known" of this task are answered by reading. Ghostty's
  terminal library records every mouse mode a program sets, lets the caller
  read it, and has a C encoder of mouse reports that takes its options from
  the terminal, the twin of the key encoder the display library already
  uses (`include/ghostty/vt/mouse/encoder.h`). The rule "Shift goes to the
  terminal's own selection" and the wheel as arrow keys on the alternate
  screen are in Ghostty's application, not in the library.
- The pointer has been the terminal's own since the day Ghostty drew in the
  sandbox (2026-08-29). That the terminal keeps it even when a program asks
  is written nowhere as a decision; the two sentences in the documents are
  agents' descriptions. No word of the owner for or against reports.
- What rests on today's behaviour: 61 test files read a screen by a pointer
  press, drag and release (`src/terminal-text.mjs`); the user's copy; the
  wheel into scrollback; a finger's drag on a phone. While a program had
  the mouse, the test reader's gesture would go to the program; the tmux
  test reads its panes that way.
- Who asks today: tmux (this build turns `mouse` on with `-DTMUX_MOUSE=1`,
  for no recorded reason; upstream's default is off), Emacs (the recipe
  turns `xterm-mouse-mode` on under a comment that says "Dolly's terminal
  reports the mouse", which it does not; the line also skips a probe),
  nvim by upstream's default. Pi's fullscreen mode asks too and was turned
  off on 2026-10-06 because the test reader could no longer read its
  screen; how the mode broke the reader was not measured then and the
  display library's code does not explain it.
- On the alternate screen the wheel does nothing today, in `less`, nvim and
  tmux alike.
- The page sends the terminal only the primary button's press, drag and
  release; other buttons and plain motion never become records without a
  lease. So reports need page code besides the display library.
- A program ended by force would leave its mouse mode set, as it leaves
  the terminal's other modes today; nothing resets a mode when the
  foreground changes.
- Not found out: whether nvim asks here; the cost of a report per motion
  sample; whether the owner wants a terminal that reports the mouse.

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
