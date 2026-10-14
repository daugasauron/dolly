# tmux

tmux 3.8 compiled inside Dolly from the pinned release. Each pane is a
pseudo-terminal of `pty@0`
([process model](../../docs/process-model.md#pseudo-terminals)).

## Images

- `tmux`: tmux, the terminal multiplexer.
- `libevent`: libevent's core, the event loop with its buffers and listeners, a library for programs the `cc` package builds; it brings no compiler.
- `libterminfo`: NetBSD's terminfo library with the terminal descriptions it holds, for programs the `cc` package builds; it brings no compiler.
- `tmux-panes`: an application that opens into tmux with a shell in each of two panes.

Open `/tmux-panes/`; build with `npm run image -- tmux-panes`. `Ctrl+B d`
detaches to Slop, the shells keep running, and `tmux attach` returns. `amy`
installs into a pane what it installs into `default`: `amy install nvim`
puts an editor beside a shell.

## Use

- Windows, panes and layouts, the status line, `send-keys`, `capture-pane`,
  `run-shell`, `if-shell`, `#()`, detach and attach work as upstream. A pane runs `$SHELL`, Slop, and any
  program built for Dolly, unchanged: the `less` and `nvim` packages, built
  before `pty@0` existed, page and edit in one. A program sees a terminal
  with its own size and mode, `/dev/tty` is its pane, and Ctrl+C interrupts
  the programs in the pane, not its shell; one that does not answer is
  ended, as at the display's terminal.
- tmux starts its own server, as upstream: Dolly has no `fork`, so the client
  spawns `tmux -D` and serves it its first command over a socket pair. The
  server outlives the client and ends with its last session.
- `INSTALL` the package into an image that declares `pty@0` and `sockets@0`.
  `default` does not declare `pty@0`, so `amy install tmux` is refused there.
- `/etc/tmux.conf` sets `default-terminal` to `xterm-256color`: Dolly's
  termcap programs, `less` among them, know that one terminal (`/etc/termcap`).

## Key files

- [`Dollyfile-libevent`](Dollyfile-libevent): states what upstream's
  `configure` script would find and builds libevent's core over `poll`:
  `-levent_core`, and `-ldolly-sockets` (the `libdolly-sockets` package)
  after it for a program that gives it sockets.
- [`Dollyfile-libterminfo`](Dollyfile-libterminfo): builds NetBSD's
  libterminfo with one fix (`tparm` formatted a number as a long and passed
  an int, which on wasm64 gave tmux cursor addresses from the stack's
  leftovers), its tables written by its own scripts with `nbperf` and
  `tic` compiled in the same recipe: `-lterminfo`, `<term.h>` and
  `<termcap.h>`. It is not curses, which is not built.
- [`Dollyfile-tmux`](Dollyfile-tmux): uses the two and `libdolly-sockets`
  to build, so an installer gets none of them, states what upstream's
  `configure` script would find and builds tmux, linked with
  `-ldolly-sockets` and `-ldolly-pty`; then runs a server, a pane and a
  command typed into it.
- [`tmux-dolly.patch`](tmux-dolly.patch), ten hunks:
  - `client.c`: the client names its terminal `/dev/tty`, since `ttyname`
    has no name for one, and sends no descriptors, since `sockets@0` passes
    none.
  - `server-client.c`: the server opens the client's terminal by the name
    the client gives, `/dev/tty`, on upstream's Cygwin path, and does not
    refuse that name as its own: Dolly has one terminal and no sessions.
  - `server.c`: the client starts its server with `osdep_start_server` in
    place of `proc_fork_and_daemon`, and a server serves the client on its
    standard input from the start, as the forked one serves its end of the
    pair.
  - `spawn.c`, `job.c`, `tmux.h`: a pane's program and a job's command are
    started by `osdep_spawn` and `osdep_job` in place of `forkpty` and `fork`.
- [`osdep-dolly.c`](osdep-dolly.c): tmux's operating system file for Dolly.
  `osdep_spawn` opens a pseudo-terminal and spawns the pane's program on its
  slave, with the pane's environment and no other descriptor of the server;
  `osdep_job` spawns a job's command on the socket tmux reads it from;
  `osdep_start_server` spawns the server with the client's socket and
  configuration, on the client's terminal.

## Limits

- `pipe-pane` forks by itself and fails saying so ("fork error"). Jobs are
  spawned: `run-shell`, `if-shell` and `#()` in a status line are tested;
  `copy-pipe` and popups take the same way and are not.
- One client at a time, on one terminal: the server opens a client's terminal
  as `/dev/tty`, which names the terminal of the client that started it.
- The mouse does nothing: tmux asks the terminal for mouse reports and the
  display's terminal gives none ([input](../../docs/input.md)). Keys choose a
  pane (`Ctrl+B o`, `Ctrl+B` and an arrow) and scroll one back (`Ctrl+B [`).
- A window keeps its shell's name whatever that shell runs (a pane started
  with a command is named after it), and a new pane starts in the session's
  directory, not the pane's: nothing tells tmux which program holds a pane
  or where it stands.

Test: `npm run test:demos -- tmux` ([`test/`](test/)); the module's own is
`test/pty-browser.mjs`.
