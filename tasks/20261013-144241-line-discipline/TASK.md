# The terminal has a line discipline: ICANON and ECHO do what they say

- STATUS: OPEN
- PRIORITY: 295
- TAGS: core,kernel,terminal

Owner (2026-10-13): "I want to get the core right, Dollyfile syntax, host
modules/bridge, browser runtime etc. It should be as clean and small as
possible in order to be extensible. Think unix philosophy (this is a core
thing)." One issue of
[the reflection on the direction](../20261013-142800-direction/TASK.md)
([reflection](../20261013-142800-direction/reflection.md), section 1).

Done when: a program that leaves the terminal in its default mode and reads
a line gets the line when Enter is pressed, edited (backspace, kill line,
kill word, end of input) and echoed, on the display's terminal and on a
pseudo-terminal's slave; a program that clears `ICANON` reads as now;
`unzip` and `zstd` take `y` and Enter at their question; Slop, `vi`, Neovim,
tmux, Pi and the core suite behave as before; in Chromium and Firefox.

## As filed (2026-10-13, main `e330d782`)

- `ICANON` and `ECHO` "round-trip without a line discipline"
  (`docs/process-model.md:103`): the flags are stored and returned and
  nothing acts on them. Slop edits its own line (`src/slop.c:5010-5050`);
  `sqlite3`, `dc` and `vi` each needed an editor of their own, and `unzip`
  and `zstd` wait at a question until Ctrl+J, because Enter sends `0d` and
  they wait for `0a`
  ([more packages](../20261012-230015-more-packages/TASK.md), the last
  section, has the measurement and a design).
- Unix put this in the kernel so that programs do not carry it.
  `dolly_kernel_socket_kind.terminal` (`src/process-kernel.h:61`) is the one
  place per kind of terminal. No new operation: with `ICANON` a terminal
  read returns an edited line, echoed when `ECHO` is set.
- To find out first: which programs today rely on getting single bytes
  without ever clearing `ICANON` (they worked because nothing was enforced),
  and what the default mode of a new terminal must be so that they do not
  break.
- Kernel C if the discipline lives in the kernel's terminal kinds; say so if
  the libc adapter (an image input) must change too.
