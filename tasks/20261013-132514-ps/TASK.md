# A minimal ps: the kernel's process table as a file, and the command that prints it

- STATUS: OPEN
- PRIORITY: 260
- TAGS: core,kernel,commands

Owner (2026-10-13): "Since there is no ps in the shell, tmux -D & is a bit
weird?", then: "add a minimal ps, create a task".

Done when: in a `default` session `ps` lists the processes that exist, each
with its PID, its parent's, its state and its command line; a server started
with `tmux -D &` shows in it and is gone from it after `tmux kill-server`;
tested in Chromium and Firefox.

## As filed (2026-10-13, main `47f11cd2`)

- Nothing lists processes: Slop has `$!`, `wait` and `kill`, and refuses
  `jobs`, `fg` and `bg` by name; no program can see the kernel's table (at
  most 32 processes: PID, parent, state, arguments, path).
- The integrator's decision, to change with its reason: no new operation of
  the process contract, whose header is stamped into every executable. The
  kernel already answers one path itself (`/proc/self/exe`); it writes its
  table to `/proc/processes` when that file is opened, one process a line,
  and `ps` is a package that prints the file under a heading, which
  `default` installs. Kernel C is no image input, so no catalog round.
