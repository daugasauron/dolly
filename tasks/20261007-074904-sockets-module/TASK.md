# sockets@0: local stream sockets between Dolly processes, and the ports that work around their absence

- STATUS: OPEN
- PRIORITY: 300
- TAGS: core,process,host-modules,abi,compatibility

Owner (2026-10-07), after a conversation about what GTK, X11 and Wayland
would need: "The reason I didn't want them was mainly to restrict network
stuff, but maybe worth adding something like that." Then: "Add a task to
create a socket module and upgrade the things that need it to use them. This
is low prio."

Owner (2026-10-08): "it could be nice to do the socket module stuff (there is
a task) in parallel since that also needs full rebuild of a lot of things".
Started on branch `core/sockets-module` (worktree `work/sockets`); its full
rebuild is shared with the release's (versioned recipes).

Owner (2026-10-08), asked whether a program using sockets must declare the
module: "Of course it needs to be declared, thats why I want to include it
with the other neccesary rebuilds". So `sockets@0` is a declared module like
the others: the client stamps the executable and the recipe carries
`REQUIRES HOST sockets@0`. The branch was built without the stamp; the stamp
and the recipe lines are added when the release round is assembled.

Nothing has been built or run for this. The findings are from reading main at
`4cbceacf`.

## Today

Every socket call, `socketpair` included, returns `ENOSYS`
(`src/process/runtime-adapter.c:285-415`). Processes talk through inherited
pipes, files and signals: two processes that no ancestor connected at spawn
cannot find each other, and no descriptor is two-way.

Ports that carry a change because of it:

- `demos/rust/config/patches/tokio-signal-pipe.patch`: tokio's signal driver
  uses `UnixStream::pair()`; the patch substitutes a mio pipe.
- `demos/rust/config/patches/crossterm.patch`: the SIGWINCH receiver and the
  wake pair are `UnixStream` pairs; the patch substitutes `libc::pipe`.
- `demos/rust/config/patches/tokio-target.patch` (`get_peer_cred` returns
  `ENOSYS`), `mio.patch`, `socket2.patch`: not read hunk by hunk. Some hunks
  only name the target; which exist only because sockets fail is to be read.
- `demos/cmake/libuv/process.c`: child stdio is a one-way `uv_pipe`; a two-way
  `UV_CREATE_PIPE` and an IPC pipe return `UV_ENOTSUP`. CMake and Neovim use
  this libuv.
- `demos/python/Dollyfile-python`: `_socket` is compiled against
  `dolly_socket_stubs.c`, where every call fails. Whether `asyncio.run` works
  today, and what its loop wakes itself with, was not checked.
- `demos/javascript/janis.js`: `net`, `http` and `https` servers fail on
  `listen` with `ENOSYS`, `net.connect` is unsupported, `child_process` IPC
  fails (`demos/javascript/README.md`, Limits).

## Proposal (Claude, 2026-10-07; the shape is the owner's)

A module `sockets@0` in `host/sockets/`, like `threads@0`: kernel C, a client
archive that stamps the requirement, its own contract and digest, and no
import. `abi/dolly-browser-0.wat` and the browser's authority do not change.
It is local only: both ends are Dolly processes and the bytes stay in kernel
memory, as a pipe's do. `env.dolly_http_dispatch` remains the only network
edge.

1. `socketpair(AF_UNIX, SOCK_STREAM)`: each end reads what the other writes,
   over the kernel's 64 KiB pipe buffers.
2. Named streams: `bind` to a path, `listen`, `accept`, `connect`; then
   `read`, `write`, `send`, `recv`, `shutdown`, `poll` and `close` as for
   pipes. A closed or dead peer gives EOF and `EPIPE`; a path nobody listens on
   gives `ECONNREFUSED`.

Refused explicitly: network families (with `EAFNOSUPPORT` rather than today's
`ENOSYS`, so upstream selects its fallback), datagram and seqpacket sockets,
descriptor passing (`SCM_RIGHTS`) and abstract names. Listeners, pending
connections and connections are a new resource kind with their own quotas.

## To settle before code

- Stamping. `cc` links client archives by default and a call stamps the
  module into the executable, which its image must then declare. A program
  that references `socket` only for a network path it never takes here would
  carry the stamp too. Count the executables of the catalog that would, as
  `20261005-222449-spawn-users` did for spawn, before choosing between a
  declared module and core operations.
- Which ports match on `ENOSYS` today and would misread `EAFNOSUPPORT`.
- What a bound path is in the filesystem (`S_IFSOCK` in `stat`), and what
  unlinking it or the listener's exit does.
- Nonblocking `connect`, `SOCK_NONBLOCK`/`SOCK_CLOEXEC`, `SO_ERROR`,
  `SO_PEERCRED` and `getpeername` are added when one of the programs above
  needs them, not in advance.

## Upgrading the ports

For each entry under Today: remove the workaround, rebuild the image, run its
demo test. A workaround that is still needed stays, with the reason recorded
here. Step 1 should retire the tokio and crossterm substitutions and libuv's
two-way pipe refusal; step 2 allows Janis and Python servers and clients on a
path. Network calls keep failing in all of them.

## Tests that decide it

In a real browser: bytes both ways over a `socketpair` inherited through
spawn; a server and a client that share no pipe connect through a path; peer
exit gives EOF to a waiting reader and `EPIPE` to a writer; a dead listener
gives `ECONNREFUSED`; `poll` wakes on readable, writable, a pending connection
and hangup; exhausting a quota fails with an errno, and exit, abort and forced
termination release what a process held; `socket(AF_INET, ...)` and `AF_INET6`
fail; the kernel's import list is unchanged.

## Cost

The socket stubs are in the process libc, so the seed changes: every image
rebuilds and the Rust seed is relinked. Dropping the Rust patches rebuilds the
Rust chain, Codex included. It belongs in a round with other seed changes, not
in one of its own.

## Not here

An X11 server needs step 2 and nothing more from the substrate (a byte stream
and `poll`). Wayland also needs descriptor passing, memory that two processes
both see (`mmap` copies, `docs/process-model.md`) and `epoll`, `timerfd` and
`eventfd`. Neither is part of this task.

## Done when

- `sockets@0` has its contract, kernel, client and the browser tests above,
  and `docs/process-model.md` says what is supported and what is refused.
- Each workaround under Today is removed or kept with its reason, its image
  rebuilt and its demo test passed.

## Related

`20261005-222449-spawn-users`, `20261006-111835-dso-module`,
`20261006-214244-process-exec`.
