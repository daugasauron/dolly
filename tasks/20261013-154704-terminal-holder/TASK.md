# Nothing can ask which program holds a terminal or where it stands: tmux's window names and new panes' directories

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: core,kernel,terminal,tmux,0.1.4

Found by [tmux in use](../20261013-133111-tmux-use/TASK.md) (2026-10-14), not fixed there.

Done when: it is decided whether the kernel answers the two questions (the
name of the program in the foreground of a terminal, its working directory)
and through what, a file under `/proc` or an operation; and tmux's
`osdep_get_name` and `osdep_get_cwd` use it, or the demo's README says the
limit stays.

Waits for the owner to read the investigation; lowered from 180 on 2026-10-23 for that reason.

## Closed (2026-10-23, `core/terminal`, `da393e43`, `08afdf81`)

Decided as below and used by tmux's `osdep_get_name` and `osdep_get_cwd`.
Measured in Chromium and Firefox: `test/process-browser.mjs` reads
`/proc/PID/cwd` of a shell and of its job (failed on the previous kernel:
`readlink: /proc/161/cwd: No such file or directory`, Chromium);
`demos/tmux/test/tmux-browser.mjs` opens a window with
`-c '#{pane_current_path}'` from a pane standing in `/tmp`, where it
writes `pwd`'s answer, and sees the window named `vi` while vi runs in the
active pane (it was `slop` whatever ran). The README's limit is gone.

## Decision

The kernel answers through `/proc`, beside what it already answers there;
no operation, no change of the process contract or of `pty@0`, no image
input (`npm run build:runtime` prints the same image inputs, `1ee15fc6`).

- **Where a process stands**: `readlink("/proc/PID/cwd")` names the
  directory of a process that has not exited, as `readlink` of
  `/proc/self/exe` names the caller's executable: one `kernel_link` in
  `PATH_READLINK` of `src/process-kernel.c`, `ENOENT` for a PID that is not
  live. It is Linux's interface for the same question, readlink only (no
  `stat`, no `/proc/PID` directory). Every process may ask about every
  other, as `/proc/processes` already lists every process's arguments: the
  userspace is one trust domain.
- **Which program holds a terminal**: no new interface. Dolly has no process
  groups, so `tcgetpgrp` keeps failing (`ENOTTY`) rather than inventing a
  group; the one program that asks, tmux, spawned the pane's program and
  knows its PID. Its `osdep_get_name` and `osdep_get_cwd` take the newest
  child of that program in `/proc/processes`, the command a pane's shell
  runs (what a shell's job control would put in the foreground), or the
  program itself, then its arguments and `/proc/PID/cwd`. A background job
  of the pane's shell counts as its newest child too; Slop has no job
  control to tell them apart.
- Not taken: a `TIOCGPGRP` answer (it needs the libc adapter, so the seed,
  and a sub-operation of the process contract's `TERMINAL` that the
  process agent is changing now, for a group Dolly does not have); a
  `pty@0` operation (seed and every image); the shell printing OSC 7 and
  titles (Slop, the seed, and it names no program another shell runs).

## State (2026-10-14, 04:00): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read `main` and
tmux 3.8's source, and changed nothing (one report in two parts; the other
is [the mouse](../20261013-154704-terminal-mouse/investigation.md)). The
integrator checked the port's two functions. It gives no verdict. What it
found:

- The kernel holds per process everything the two questions need (parent,
  arguments, working directory as an open handle, which descriptors are
  the display's terminal or a pseudo-terminal's slave) and tells a program
  none of it about another process, except what `/proc/processes` prints
  since 2026-10-13 (PID, parent, state, arguments).
- "Who holds a terminal" exists in the kernel twice, both times only to aim
  a signal: the display's foreground owner (published to the page, never
  to a program) and, for a pseudo-terminal, the holders of the slave less
  the one the others descend from.
- What tmux does without the answers is narrower than this task said. A
  pane started with a command is named from its arguments already; only a
  program that the pane's shell runs is invisible, so the name stays
  `slop`. A new pane starts in the session's directory (the directory of
  the client that created it), not the server's, and that is upstream's
  default too: the pane's own directory is used only by a binding with
  `-c '#{pane_current_path}'`, which is empty here.
- tmux 3.8, unchanged, understands the escape by which a shell tells its
  terminal the directory (OSC 7, kept as `#{pane_path}`) and the title
  escapes (OSC 0 and 2, `#{pane_title}`): the `"dolly"` on the status line
  is the pane's title, the host name. Slop prints neither. Ghostty records
  both at the display's terminal and the display library reads neither.
- The ways the tree or upstream shows, each walked in section 5 with what
  it rebuilds: a path under `/proc` answered by the kernel as
  `/proc/processes` is (kernel C only; a terminal needs a name, and the
  display's has none by decision); an operation (of the process contract:
  every image; of `pty@0`: tmux, if the image inputs hold, not built); the
  shell telling the terminal by escapes (Slop is in the seed; a tmux
  configuration line alone needs no rebuild but only a shell that prints
  them); leaving it as the README says.
- The one decision on record about the shape is the integrator's for `ps`:
  no new operation, and a pipe at each open instead of a file, with its
  reasons and its price (`stat` does not find the path).
- Others that work around the same lack: `dte` (one changed line), Emacs
  (one patched check), CPython (five configure answers).
- Not found out: what `getpgrp` answers; whether a change to `pty@0` alone
  moves the image inputs; whether the owner wants a process to see
  another's directory or terminal at all.

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
