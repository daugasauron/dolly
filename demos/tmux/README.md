# tmux

tmux 3.8 compiled inside Dolly from the pinned release. Each pane is a
pseudo-terminal of `pty@0`, a prototype host module
([`host/pty/dolly-pty-0.wat`](../../host/pty/dolly-pty-0.wat)).

## Images

- `tmux`: tmux, the terminal multiplexer, as a package.
- `tmux-panes`: an application that opens into tmux with a shell in each of two panes.

Open `/tmux-panes/`; build with `npm run image -- tmux-panes`. `Ctrl+B d`
detaches to Slop, the shells keep running, and `tmux attach` returns. `amy`
installs into a pane what it installs into `default`: `amy install nvim`
puts an editor beside a shell.

## Use

- Windows, panes and layouts, the status line, `send-keys`, `capture-pane`,
  detach and attach work as upstream. A pane runs `$SHELL`, Slop, and any
  program built for Dolly, unchanged: the `less` and `nvim` packages, built
  before `pty@0` existed, page and edit in one. A program sees a terminal
  with its own size and mode, `/dev/tty` is its pane, and Ctrl+C interrupts
  the programs in the pane, not its shell; one that does not answer is
  ended, as at the display's terminal.
- Dolly has no `fork`, so tmux does not start its own server and says so. A
  shell starts it, `tmux -D &`, and it lives as long as that shell;
  `tmux-panes` starts it from the image's entry.
- `INSTALL` the package into an image that declares `pty@0` and `sockets@0`.
  `default` does not declare `pty@0`, so `amy install tmux` is refused there.
- `/etc/tmux.conf` sets `default-terminal` to `xterm-256color`: Dolly's
  termcap programs, `less` among them, know that one terminal (`/etc/termcap`).

## Key files

- [`Dollyfile-tmux`](Dollyfile-tmux): states what upstream's `configure`
  scripts would find; builds NetBSD's libterminfo (its tables written by its
  own scripts with `nbperf` and `tic` compiled in the same recipe),
  libevent's core over `poll`, and tmux; then runs a server, a pane and a
  command typed into it.
- [`tmux-dolly.patch`](tmux-dolly.patch), nine hunks:
  - `client.c`: the client names its terminal `/dev/tty`, since `ttyname`
    fails, and sends no descriptors, since `sockets@0` passes none.
  - `server-client.c`: the server opens that terminal by name, on upstream's
    Cygwin path, and does not refuse `/dev/tty` as its own: Dolly has one
    terminal and no sessions.
  - `server.c`: without a server tmux says how to start one, instead of
    forking; `waitpid` is asked without `WUNTRACED`, which Dolly refuses.
  - `spawn.c`, `tmux.h`: a pane's program is started by `osdep_spawn` in
    place of `forkpty`.
- [`osdep-dolly.c`](osdep-dolly.c): tmux's operating system file for Dolly.
  `osdep_spawn` opens a pseudo-terminal and spawns the pane's program on its
  slave, with the pane's environment and no other descriptor of the server.
- [`pty.c`](pty.c): `openpty` and `ioctl(TIOCSWINSZ)` over `pty@0`, which
  ships no client yet; the packets are `host/pty/pty.h`, staged as
  `dolly-pty.h`.

## Limits

- No jobs: `run-shell`, `if-shell`, `#()` in the status line, `pipe-pane`,
  `copy-pipe` and popups fork, and fail saying so ("failed to run command").
- A server started with `tmux -D &` is a job of that shell: Ctrl+C for another
  command of the shell reaches the server too, and it exits. Dolly has no
  sessions to put it in. `tmux-panes` starts it beside the shell instead.
- One client at a time: the server opens the client's terminal by name, and
  Dolly has one.
- `man tmux` shows the page's source: Dolly has no formatter for it.

Test: `npm run test:demos -- tmux` ([`test/`](test/)); the module's own is
`test/pty-browser.mjs`.
