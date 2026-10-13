# Nothing can ask which program holds a terminal or where it stands: tmux's window names and new panes' directories

- STATUS: OPEN
- PRIORITY: 180
- TAGS: core,kernel,terminal,tmux

Found by [tmux in use](../20261013-133111-tmux-use/TASK.md) (2026-10-14), not fixed there.

Done when: it is decided whether the kernel answers the two questions (the
name of the program in the foreground of a terminal, its working directory)
and through what, a file under `/proc` or an operation; and tmux's
`osdep_get_name` and `osdep_get_cwd` use it, or the demo's README says the
limit stays.

## As filed (2026-10-14, `integrate/round-1013` `0155af64`)

- In tmux a window's name stays `slop` whatever runs in it, and a new pane
  starts in the server's directory, not in the pane's.
- `demos/tmux/osdep-dolly.c` answers nothing to both: there is no way to ask.
- Since the same night `/proc/processes` lists PID, PPID, state and command
  ([ps](../20261013-132514-ps/TASK.md)). It names no terminal and no
  directory, and a terminal's foreground process is the kernel's own
  bookkeeping.
- This is a question about the contract's shape, so the owner's: what a
  process may learn about another one. Nothing here is decided.
