# The display's terminal reports the mouse to no program: tmux's mouse does nothing

- STATUS: CLOSED
- PRIORITY: 120
- TAGS: core,display,terminal,tmux,0.1.4

Found by [tmux in use](../20261013-133111-tmux-use/TASK.md) (2026-10-14), not fixed there.

Done when: a program that asks the terminal for mouse reports (`CSI ? 1000 h`
and the modes beside it, SGR encoding) gets them from the display's terminal
while it asks, and the terminal's own selection and scrollback are as before
whenever no program asks; shown by tmux (a click selects a pane, the wheel
scrolls one) in both browsers, with a test that fails before.

Not now: the owner signed off the recommendation of 2026-10-14 to leave the terminal's mouse
for later ([next round](../20261012-220109-next-round/TASK.md)); lowered from 230 on 2026-10-23.
Taken up for 0.1.4 the same evening by the integrator's brief for the terminal.

## Closed (2026-10-23, `core/terminal`, `da393e43`, `08afdf81`)

The done-when is met: tmux's click chooses a pane and its wheel scrolls the
pane under the pointer, in Chromium and Firefox, and the terminal selects
and scrolls back as before while no program asks (the copy and scrollback
steps of `test/terminal-browser.mjs` are unchanged and pass).

- `src/ghostty/display.c` asks Ghostty whether the program tracks the mouse
  (`GHOSTTY_TERMINAL_DATA_MOUSE_TRACKING`) and, while it does, encodes with
  Ghostty's mouse encoder in the mode and form the program set (9, 1000,
  1002, 1003; 1005, 1006, 1015, 1016) and writes the report where the
  terminal's replies go (`pty_response`), read before the next record.
  - A press of the primary button decides who has the gesture up to its
    release: the program, unless Shift is held, as in Ghostty's application
    (`mouse-shift-capture` false); then, and whenever no program asks, the
    selection gesture as before. A reported press clears the selection.
  - Motion without the button is reported to a program that asked for all
    motion, once per cell; the wheel is one button 4 or 5 press per row of
    the scroll, at most a page, where the pointer last was. Without a
    request the wheel scrolls back as before; on the alternate screen it
    still does nothing (alternate scroll, 1007, is not done).
- `host/input/input.mjs`: the page sends the terminal every move of the
  pointer, not only drags, so the wheel lands in the pane under the pointer
  and 1003 works; a release the page did not see (outside the window)
  is sent before the next move instead of being dropped on blur. Records
  are sampled once per animation frame, as drags were. No new authority:
  the `input@0` row already lists pointer positions on the canvas.
- The screen reader (`src/terminal-text.mjs`, the page's
  `visibleTerminalText` and `waitForInteractiveTerminal`) and the demo
  helper's `clearSelection` hold Shift, so they read and clear the
  selection while a program has the mouse (tmux, nvim, Emacs with
  `xterm-mouse-mode`).
- Not changed: `host/input/input.h` says pointer and scroll records are the
  terminal's own (selection, scrollback) and yield no bytes. They still
  yield no bytes from the decoder; the reports leave as replies. The
  parenthesis is incomplete; correcting it changes the seed, so it waits
  for the next seed change.
- Left, as limits: only the primary button reaches the terminal (the page
  would otherwise have to know when to keep the browser's context menu),
  so tmux's menus and middle-button paste are keys; a program ended by
  force leaves its mouse mode set, as it leaves its other modes, and a
  click then types a report at the shell (Shift still selects; `printf
  '\033[?1000l'` resets); reports are handled on the display's tick ahead
  of keys the program has not read yet, as selection was.
- Tests that failed before and pass now, Chromium and Firefox:
  `test/terminal-browser.mjs`, a probe that asks for 1003 and 1006 and
  must read, in one cell, the motion, press, release and a wheel step down
  while the screen is read with Shift (before: no report, the probe timed
  out, status 30); `demos/tmux/test/tmux-browser.mjs`, a click chooses the
  left pane and the wheel scrolls the right one, inactive, into copy mode
  and out (before: the text went to the active pane, `CLICKED--`). The
  screen reader's gestures move the pointer too, so the tmux test moves
  the mouse back over the pane before the wheel, as a user's hand does.
- On a phone a finger's drag is a wheel where the mouse last was, and a
  phone has none: under tmux it scrolls the pane at the top left. (Gone
  the same day, `4e69d8bc`: the page sends the finger's position before
  each scroll record; `test/touch-browser.mjs` holds it.)
- Later the same day `host/input/input.h`'s comment on pointer and scroll
  records was made true at the integrator's request. A change of that
  header is a change of the seed (image inputs `1ee15fc6` to `a7990a19`)
  and of `input@0`'s ABI digest (`88451810` to `bc086c22`): every
  executable that links the input client is rebuilt with the round.
- Also passing after the change, both browsers: `test/display-browser.mjs`,
  `test/touch-browser.mjs`, `test/process-browser.mjs` and the Emacs demo
  (its `site-start.el` turns `xterm-mouse-mode` on); the Neovim demo
  (`mouse=nvi` by upstream's default), which runs in Chromium only. The
  core suite as a whole was not run (the integrator's).

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
