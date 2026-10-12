# tmux in Dolly: what it needs beyond sockets@0

- STATUS: OPEN
- PRIORITY: 300
- TAGS: demo,tmux,sockets,process

Owner (2026-10-12): "Investigate if you can now make tmux work (I think with
sockets added it should be ok?)."

## Answer

Not with sockets alone. `sockets@0` carries tmux's client-server protocol
unchanged, but tmux needs three more things, each measured below:

1. **Pseudo-terminals**: every pane is one. Dolly had none.
2. **A server and a pane's program started without `fork`**: upstream's own
   `tmux -D` runs the server in the foreground; a pane needs spawn on a
   pseudo-terminal in place of `forkpty`.
3. **The client's terminal in the server**: tmux passes it as a descriptor
   (`SCM_RIGHTS`), which `sockets@0` refuses. Not needed: Dolly has one
   terminal, `/dev/tty`, which the server opens by name, as upstream already
   does on Cygwin.

With a prototype of (1) as a host module of two operations, kernel and
supervisor only and **not a seed change** (`pty@0`, below), and a patch of
nine hunks for (2) and (3), upstream tmux 3.8 built by Dolly's `cc` runs: two panes, a shell in each,
typing in the active pane, Ctrl+C for the program in it, a window resize,
detach and attach. The unchanged `less` and `nvim` packages run in a pane.
The contract's shape is the owner's to decide; the proposal and what the
prototype leaves out are under "Proposal".

To try it: `npm run dev -- tmux-panes` in `work/tmux`, then `/tmux-panes/`
([demo](../../demos/tmux/README.md)). Screenshots of both browsers are in
`work/tmux/build/tmux-evidence/evidence-*.png`.

## Measured: the build

tmux 3.8, libevent 2.1.13-stable and the terminfo library of netbsd-curses
0.3.2, release archives, compiled by Dolly's `cc` in a session of `system`
(`build/tmux-evidence/`, 2026-10-12). All of tmux compiles in 20 s at four
jobs and links to 1.56 MB; the `tmux` package builds in 44 s.

| Asked for | What Dolly answered | Taken |
| --- | --- | --- |
| `./configure` | Slop: "This script requires a shell more modern than all the shells that I found on your system." | The recipe states configure's answers, as `less` does. Each was measured by compiling the header or linking the function (180 probes, 19.5 s) |
| `-iquote.` (upstream's `Makefile.am`) | `cc: unsupported option: -iquote` | `-I` |
| a terminfo library (`setupterm`, `tigetstr`, `tparm`) | `curses.h`, `term.h`: file not found; `setupterm`, `tiparm`: undefined symbol. GNU termcap, which `less` uses, has no `setupterm` | NetBSD's libterminfo (netbsd-curses), eleven files compiled unchanged. Its tables are written inside Dolly by its own scripts, run by Slop, with its `nbperf` and `tic` compiled in the same recipe: byte for byte what the scripts write on Linux |
| libevent | `event.h`, `event2/event.h`: file not found | libevent's core, 16 files compiled unchanged, `poll` backend, with a stated `event-config.h`. `epoll` and `select` are not claimed |
| `sys/queue.h`, `sys/tree.h`, `bitstring.h`, `libutil.h`, `util.h`, `vis.h` | file not found | tmux's own `compat/` |
| `closefrom`, `freezero`, `getdtablecount`, `getdtablesize`, `getpeereid`, `getprogname`, `htonll`, `ntohll`, `setproctitle`, `strtonum`, `recallocarray`, `imsg_add`, `daemon`, `stravis`, `fdforkpty`, `b64_ntop` | undefined symbol | tmux's own `compat/` |
| `fork`, `forkpty`, `openpty`, `posix_openpt`, `execl`, `setsid`, `sendmsg`, `ttyname` | link; what they answer when called is below | |

## Measured: the first runs, upstream source unchanged

| Step | Result |
| --- | --- |
| `tmux new` | "directory /tmp/tmux-0 has unsafe permissions": Dolly has no permission bits, so `mkdir(0700)` reads back with the others' bits set. Upstream's knob `-DTMUX_SOCK_PERM=0` |
| `tmux new` again | log: "fatal: Function not implemented: fork failed" (`proc_fork_and_daemon`) |
| `tmux -D &` (the server in the foreground), then `tmux new -d` | the server listens and accepts on `sockets@0`; the client connects, identifies and sends its terminfo capabilities, then "server exited unexpectedly": `sendmsg` with `SCM_RIGHTS` failed `ENOTSUP`. The server logs "lost client" |

What the calls tmux makes answer in Dolly (`build/tmux-evidence/fx/calls.c`):

| Call | Answer |
| --- | --- |
| `fork()` | -1, `ENOSYS` |
| `forkpty()`, `openpty()`, `posix_openpt()`, `open("/dev/ptmx")` | -1, `ENOENT` |
| `execl("/bin/true")` | -1, `ENOEXEC` |
| `sendmsg(SCM_RIGHTS)` | -1, `ENOTSUP` |
| `ttyname(0)` on the terminal | `NULL`, `ENOENT` |
| `ioctl(TIOCSWINSZ)` | -1, `EPERM`, from the libc before the kernel is asked |
| `waitpid(-1, WNOHANG\|WUNTRACED)` | -1, `ENOTSUP`: tmux's `SIGCHLD` handler asks for stopped children and ends the server with "waitpid failed" |
| `getsockopt(SO_PEERCRED)` | -1, `ENOPROTOOPT`. Claimed (`HAVE_SO_PEERCRED`), tmux denies every client; not claimed, its `compat/getpeereid.c` answers the one user |
| `tcgetpgrp(0)` | -1, `ENOTTY` |
| `setsid()`, `socketpair()`, `flock()`, `isatty(0)`, `tcgetattr(0)`, `TIOCGWINSZ`, `sigaction` for `SIGUSR1/2`, `SIGTSTP`, `SIGCONT` | succeed |

Also measured once past these:

- tmux refuses a client whose terminal is named `/dev/tty` ("can't use
  /dev/tty"), because that is the server's own.
- A program in a pane that opened `/dev/tty` got the display's terminal:
  `less`, which reads its keys there when its input is a pipe (`man`), took
  the keys tmux reads. Hence the rule for `/dev/tty` below.
- Slop in a pane published its commands' results to the page, as the shell
  at the display does: the page took a pane's command for its own.
- The server exits on `SIGINT`. Started as `tmux -D &`, it is a job of that
  shell, and Dolly's Ctrl+C goes to every descendant of the shell: Ctrl+C
  for any later command ended the server and its panes.

## Proposal: `pty@0`

Prototyped on `demo/tmux` in commits of its own (`host/pty/`, the stream
kinds in `src/process-kernel.{h,c}`, one method in
`src/process-supervisor.mjs`, `test/pty-browser.mjs`). The contract is
[`host/pty/dolly-pty-0.wat`](../../host/pty/dolly-pty-0.wat).

- A pseudo-terminal is two descriptors of the process contract, a master and
  a slave, each read, written, polled, duplicated, inherited and closed like a
  pipe. The bytes stay in kernel memory; no browser import, no authority.
- **Two operations**: `OPEN` (flags, rows, columns: master, slave, number) and
  `RESIZE` (master, rows, columns: `SIGWINCH` to the slave's holders).
- **The slave needs none.** The process contract already has a terminal
  request by descriptor (`DOLLY_PROCESS_TERMINAL`: isatty, mode, size, timed
  read), which every program's libc uses for the display's terminal. The
  kernel answers it for a slave too, so Slop, `less`, Neovim or anything built
  for Dolly runs on a pseudo-terminal unchanged and unrebuilt. `process.h`
  and its ABI digest do not change.
- The discipline is the display terminal's: no input editing or echo, `OPOST`
  with `ONLCR` writes LF as CRLF, and under `ISIG` byte 3 is `SIGINT`.
  Dolly has no process groups, so the interrupt goes to the processes that
  hold the slave, except the one the others descend from while it has them:
  the programs in a pane are interrupted and its shell is spared, as at the
  display terminal (`SPAWN_INTERACTIVE`).
- A process whose descriptor 0, 1 or 2 is a slave opens that slave as
  `/dev/tty`, as `/dev/stdin` opens descriptor 0. A shell's published result
  is the page's only from the display's terminal.
- Closing the master is `SIGHUP` to the slave's holders; the slave closed is
  end of file to the master.
- The supervisor delivers a pseudo-terminal's three signals as it delivers a
  kill: the module queues them and two kernel exports hand them over
  ([`dolly-pty-supervisor-0.wat`](../../host/pty/dolly-pty-supervisor-0.wat)).
  So a program that makes no system call is ended by Ctrl+C or the hang-up
  after the 500 ms grace, as at the display's terminal (tested). Marked
  pending in the kernel alone, as a first version did, Ctrl+C left
  `for (;;) {}` running in its pane (measured).
- Quota: 32 pseudo-terminals in the kernel, 4 KiB of input and 64 KiB of
  output each; `ENFILE` beyond. Exit, abort and forced termination give them
  back (tested).
- In the kernel a pseudo-terminal's end is the same kind of object as a
  socket: `dolly_kernel_socket` gained a table of five functions
  (`dolly_kernel_socket_kind`), and `host/sockets/kernel.c` is its first user.

What the prototype leaves for the decision:

1. **The client is not in the seed.** `module.json` lists no header and no
   client, so `dolly.data` and the image-inputs hash are unchanged
   (`a7ee26c5…` before and after) and every image stays valid. The two calls a
   program needs, `openpty` and `ioctl(TIOCSWINSZ)` on a master, are in the
   demo (`demos/tmux/pty.c`), and nothing stamps `pty@0` into an executable:
   a recipe's `REQUIRES HOST pty@0` is a statement, not yet enforced.
   Accepted, they become `host/pty/client.c` and `<dolly/pty.h>` with a
   stamped digest that the loader checks, as for `sockets@0`: that step is
   the seed change. The libc's `ioctl` answers `TIOCSWINSZ` with `EPERM`
   itself, so either the adapter forwards it or the client wraps `ioctl` as
   the demo does. `Dollyfile` (`default`) then declares `pty@0`, as it does
   `sockets@0`; until then `amy install tmux` is refused there ("needs
   pty@0"). The module's row in `docs/browser-boundary.md` and its section
   in `docs/process-model.md` belong to the same step: both documents are
   pinned in the docs package, so the prototype leaves them alone and the
   contract's words are in the two WAT files.
2. **A server that outlives its client and leaves the shell's tree.** A
   Dolly child ends with its parent, and Ctrl+C reaches every descendant of
   the shell. So the client cannot start the server, and a server started as
   a shell's job dies with that shell's next Ctrl+C (measured). The
   `tmux-panes` image starts the server from its entry, beside the shell the
   person types in, where neither applies (tested). Doing it from `tmux`
   itself needs a spawn that is not the caller's child: a change to the
   process contract, not prototyped.
3. **`/dev/tty` by descriptor, not by session.** A program in a pane with all
   three standard descriptors redirected opens the display's terminal there.
   A terminal recorded per process and inherited through spawn would be
   exact; it also is what (2) needs to keep Ctrl+C at the display out of the
   panes.
4. Not needed and not built: descriptor passing, `/dev/ptmx` and
   `/dev/pts/N` as files, `fork`.

Smaller findings the libc could take without a new contract: `ttyname` of the
terminal could answer `/dev/tty`; `waitpid` could accept `WUNTRACED`, since no
child ever stops.

## What runs, and how it was checked (2026-10-13)

`demo/tmux`, with `main` at `d056c78f` merged in. The module: `d9f8104e`
(the two operations and the stream kinds), `1eb35e5a` (published results),
`f0f9befc` (`/dev/tty`), `a095e7d0` (who the interrupt key spares),
`ec45edee` (the supervisor's two exports), tests in `1f79a662`. The demo:
`a0af3749` and after. `npm run build:runtime` prints image inputs
`a7ee26c5…` before and after each.

- `test/pty-browser.mjs`, Chromium and Firefox: both ends in one process,
  refusals, a program on a slave (input, `/dev/tty`, resize, interrupt, raw
  mode, hang-up, end of file), a shell and its script under the interrupt
  key, a program that makes no system call ended by the key and by the
  hang-up, flow control both ways, the quota after exit, abort and a forced
  end. Twelve runs in Chromium and six in Firefox passed after one race in
  the fixture itself was removed (its program read without first looking at
  what its handler had noted: one run in fourteen).
- `demos/tmux/test/tmux-browser.mjs`, Chromium and Firefox: `tmux-panes`
  opens into two panes; typing reaches the active pane; each shell is its
  own; Ctrl+C ends `sleep` in a pane and not its shell; a window resize
  reaches a program in a pane as `SIGWINCH` with the new size, twice;
  detached, a pane's command still writes its file; Ctrl+C at the shell does
  not reach the server; attached again the panes are as left; the session
  ends with its last pane. In Chromium the package: refused by `default`
  naming `pty@0`, and installed over a `default` that declares it.
- `test/amy-browser.mjs`, both browsers, all eight cases: `tmux` has its row
  there ("default refuses it").
- By hand, with screenshots: three panes and a second window, clock mode,
  60,000 lines through a pane, `man tmux` under `less`, `amy install nvim`
  then Neovim edited and resized in a pane, and Ctrl+C ending `for (;;) {}`
  in a pane.
- The core browser suite (`node test/browser-tests.mjs`) on the merged tree
  with the changed kernel and supervisor, Chromium and Firefox: every test
  passes except `fs-growth-browser.mjs`, whose page is ended by the 6 GB cap
  of the browser slot ("Target crashed") in both. It was not run under a
  larger cap.
- `node --test test/dolly.artifacts.mjs` over the 38 packages and the images
  registered in this tree: 17 of 17, among them that the kernel exports
  exactly what its contracts name and that its browser imports are unchanged.
- Not run: the catalog (`config/domain-pages-images.txt` does not list
  `tmux`; the module is a proposal).

The task stays open for the owner's decision on `pty@0`. Its done-when is
met on the branch.

Done when: tmux runs in a Dolly session with two panes, or the task says
exactly which operations are missing, each with its measurement.
