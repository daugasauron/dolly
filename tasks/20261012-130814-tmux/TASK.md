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

With a prototype of (1) as a host module of two operations, kernel only and
**not a seed change** (`pty@0`, below), and a patch of seven hunks for (2) and
(3), upstream tmux 3.8 built by Dolly's `cc` runs: two panes, a shell in each,
typing in the active pane, Ctrl+C for the program in it, a window resize,
detach and attach. The contract's shape is the owner's to decide; the
proposal and what the prototype leaves out are under "Proposal".

## Measured: the build

tmux 3.8, libevent 2.1.13-stable and the terminfo library of netbsd-curses
0.3.2, release archives, compiled by Dolly's `cc` in a session of `system`
(`build/tmux-evidence/`, 2026-10-12). All of tmux compiles in 20 s at four
jobs and links to 1.56 MB.

| Asked for | What Dolly answered | Taken |
| --- | --- | --- |
| `./configure` | Slop: "This script requires a shell more modern than all the shells that I found on your system." | The recipe states configure's answers, as `less` does. Each was measured by compiling the header or linking the function (180 probes, 19.5 s) |
| `-iquote.` (upstream's `Makefile.am`) | `cc: unsupported option: -iquote` | `-I` |
| a terminfo library (`setupterm`, `tigetstr`, `tparm`) | `curses.h`, `term.h`: file not found; `setupterm`, `tiparm`: undefined symbol. GNU termcap, which `less` uses, has no `setupterm` | NetBSD's libterminfo (netbsd-curses), eleven files compiled unchanged. Its three generated tables are made on the host by upstream's own scripts (a bootstrap exception: `demos/tmux/prepare-terminfo.sh`) |
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

Also measured once past these: tmux refuses a client whose terminal is named
`/dev/tty` ("can't use /dev/tty"), because that is the server's own.

## Proposal: `pty@0`

Prototyped on this branch in commits of its own (`host/pty/`, the stream
kinds in `src/process-kernel.{h,c}`, `test/pty-browser.mjs`). The contract is
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
  hold the slave and are not waiting for a descendant that holds it: the
  program in a pane is interrupted, its shell is spared, as at the display
  terminal (`SPAWN_INTERACTIVE`).
- Closing the master is `SIGHUP` to the slave's holders; the slave closed is
  end of file to the master.
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
   demo (`demos/tmux/pty.c`). Accepted, they become `host/pty/client.c` and
   `<dolly/pty.h>` with a stamped digest and `REQUIRES HOST pty@0` enforced by
   the loader, as for `sockets@0`: that step is the seed change. The libc's
   `ioctl` answers `TIOCSWINSZ` with `EPERM` itself, so either the adapter
   forwards it or the client wraps `ioctl` as the demo does.
2. **Signals from a pseudo-terminal bypass the supervisor.** The kernel marks
   them pending and wakes blocked calls, which is how the display's resize
   already works. A program in a pure CPU loop is therefore not ended after
   500 ms as at the display terminal; `kill` from another pane ends it. The
   fix is one supervisor export that hands such signals to `#deliverSignal`.
3. **A server that outlives its client.** A Dolly child ends with its parent,
   so the client cannot start the server and then detach. The demo starts it
   from the shell (`tmux -D &`). Starting it from `tmux` itself needs a spawn
   that is not the caller's child: a change to the process contract, not
   prototyped.
4. Not needed and not built: descriptor passing, `/dev/ptmx` and
   `/dev/pts/N` as files, `fork`.

Smaller findings the libc could take without a new contract: `ttyname` of the
terminal could answer `/dev/tty`; `waitpid` could accept `WUNTRACED`, since no
child ever stops.

Done when: tmux runs in a Dolly session with two panes, or the task says
exactly which operations are missing, each with its measurement.
