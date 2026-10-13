# A minimal ps: the kernel's process table as a file, and the command that prints it

- STATUS: CLOSED
- PRIORITY: 260
- TAGS: core,kernel,commands

Owner (2026-10-13): "Since there is no ps in the shell, tmux -D & is a bit
weird?", then: "add a minimal ps, create a task".

Done when: in a `default` session `ps` lists the processes that exist, each
with its PID, its parent's, its state and its command line; a server started
with `tmux -D &` shows in it and is gone from it after `tmux kill-server`;
tested in Chromium and Firefox.

## Closed (2026-10-14, branch `core/ps`)

The done-when is met on the branch: the kernel's `/proc/processes`
(`06872986`), the `ps` package that `default` installs (`ac4c05d3`), the
documents (`c86a4130`) and their pins (`36935d2b`). Integration rebuilds
`ps` and `default`, and for the documents `dolly-docs`, `pi-agent`,
`pi-local` and `dollyfile-studio`; the kernel change rebuilds no image.

What a `default` session shows after `nena enable pty && amy install tmux`
and `tmux -D &` (Chrome 151; Firefox 155 prints the same lines):

```
PID PPID STATE COMMAND
100 0 running /bin/foreground -i /bin/slop /etc/dolly/init.slop
101 100 running /bin/slop /etc/dolly/init.slop
113 101 running /bin/foreground -i /bin/slop
114 113 running /bin/slop
123 114 running tmux -D
127 114 running /bin/slop /bin/ps
129 127 running cat /proc/processes
```

After `tmux kill-server` the line of 123 is gone, before the shell's `wait`.

## Decisions

- **No new operation**, as filed: `include/dolly/process.h` is unchanged and
  `npm run build:runtime` prints the same image inputs (`538c5a8a`). The
  kernel answers `DOLLY_PROCESS_PATH_OPEN` of the exact path
  `/proc/processes` itself, beside its answer to `readlink` of
  `/proc/self/exe`.
- **Not a file in the tree, changed from the filing.** The filing had the
  kernel write the table into a file at that path and then open it. Each
  open instead gets a pipe that has no writer and already holds the table.
  Reasons, by construction and not by a measurement of the other design:
  - two readers at once need a table each, so a file would have to be
    replaced at every open anyway;
  - a file in the tree is saved with the session and restored naming
    processes that no longer exist, and a recipe that ran `ps` would retain
    it in its image;
  - `/proc` would become a directory, which is what programs test to find
    Linux's procfs, and the porting rules forbid claiming Linux;
  - nothing has to refuse a write: a pipe's read end takes none.

  Measured for what was built (Chrome 151): `ls /proc`, `stat
  /proc/processes`, `test -e /proc/processes` and `cp /proc/processes X`
  fail with "No such file or directory"; `cat`, `grep`, `head`,
  `wc -l < /proc/processes` and `tail -n 2 < /proc/processes` read it;
  `echo x > /proc/processes` and `>>` fail with "Permission denied"
  (`EACCES`), as does Python's `os.open(..., os.O_RDWR)`; `os.write` to a
  descriptor of it fails with "Bad file descriptor", `os.fstat` says FIFO
  and `open('/proc/processes').read()` returns the lines.
  The price: only `open` knows the path, so a program that asks `stat`
  first does not find it, and the descriptor is a FIFO, not seekable.
- **`ls /proc`** therefore shows nothing: there is no `/proc`, as the
  process model already says.
- **The line**: `PID PARENT STATE ARGUMENTS`, single spaces, a newline at
  the end, lines in PID order (the table's slots are reused, so its own
  order would put a child above its parent). The first three fields cannot
  hold a space. The arguments are joined by spaces, so their boundaries are
  not recoverable, as in any `ps`. A byte below 0x20 or 0x7f is written as
  `?`: an argument with a newline would otherwise be two lines, and an
  escape sequence would steer the terminal that prints it. A process without
  arguments has a line of three fields. The executable's path is not a
  field: it can hold a space, and `/proc/self/exe` gives a process its own.
- **A line ends after 2047 bytes**, newline included 2048: the pipe holds
  64 KiB and the table 32 processes. A longer command line is cut, possibly
  inside a UTF-8 character.
- **States**: `starting` (spawned; its Worker has not entered the program,
  which is while the supervisor compiles the executable) and `running`.
  These are the two the kernel keeps for a process that has not exited.
- **A process that has exited and is not yet waited for is not listed.**
  Its arguments and path are released when it exits, so the kernel has only
  its PID and status left; and Slop collects a `&` program only at `wait`,
  so listing it would keep `tmux -D` on the list after `tmux kill-server`
  until the user typed `wait`. The slot it holds until then is not shown.
- **`ps` is a Slop script in its recipe**, six lines, not a C program: a
  heading, then `cat /proc/processes`. A C program would need a source file,
  its staging, a pin and a compiler image to build on; the recipe now has no
  `FROM`, no `SOURCE` and builds from nothing. What it costs: `ps` lists
  itself as two processes (`/bin/slop /bin/ps` and `cat /proc/processes`)
  and the columns are not aligned. Measured: `ps` 14 ms, `cat
  /proc/processes` 4 ms (Chrome 151, `time`).
- **No options.** `ps -e`, `ps aux` and the like print the manual page on
  standard error and end with 2; `ps --help` prints it and is what `man ps`
  shows, as for Dolly's other commands.

## Tested

- `test/process-browser.mjs`, "process list", in a `default` session: a
  program started with `&` is listed under `$!` with the shell's `$$` as its
  parent, by `/proc/processes` and by `ps`; it is gone once killed, before
  `wait` returns its 143; a descriptor opened before a program was started
  does not list it while one opened after does, and each reads whole lines;
  the path and its descriptor take no write and `/proc` does not exist; an
  argument with a newline and an escape is one line; an argument of 3000
  bytes gives a line of 2048; `ps -e` is 2 with nothing on standard output.
- `demos/tmux/test/tmux-browser.mjs`, "tmux in ps", the done-when as a
  person types it: `nena enable pty && amy install tmux`, `tmux -D &`, the
  line `$! $$ running tmux -D` in `ps`, `tmux kill-server`, the line gone.
- Runs of 2026-10-14 with the kernel of `06872986` and `default` of
  `ac4c05d3` (Chrome 151.0.7922.71, Firefox 155.0): the core suite, all
  passed in each browser (318 s and 276 s); the tmux test in both; Pi's demo
  test 12 times of 12; the JavaScript and Python demo tests; the source
  suite, 349 of 349. Logs: `build/ps-evidence/`.
- The core suite ran against 122 of the 134 images: the worktree is a slim
  one, and its first run stopped in `amy-browser.mjs` at `amy install
  pkgconf`, a package whose sources (`dist/static/zero-ad-build`) the tree
  lacked. With that directory and `dist/static/llama` linked from the
  integration tree the run passed. Not in it: `dollyfile-studio`,
  `pi-local`, `xonotic*`, `zero-ad` and the model packages.

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
