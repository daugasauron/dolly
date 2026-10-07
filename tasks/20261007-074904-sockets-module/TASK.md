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

## Settled before code (2026-10-08, `core/sockets-module`)

Measured on the 76 images of `work/sockets/dist` (image inputs `c62b2710…`),
nothing built. The scripts and raw results are in `build/sockets-evidence/`
(ignored): `scan-socket-references.mjs` gunzips every pack an image lists and,
for each file that starts with `\0asm`, reads the import and export sections,
the `name` section and the `dolly.host` records; `report.mjs` tabulates it.

### Stamping: who would carry a `sockets@0` record

- The signal: an executable whose `name` section still holds one of the 18
  libc socket functions (`socket`, `socketpair`, `connect`, `bind`, `listen`,
  `accept`, `accept4`, `getsockname`, `getpeername`, `recv`, `send`, `sendto`,
  `recvfrom`, `sendmsg`, `recvmsg`, `getsockopt`, `setsockopt`, `shutdown`)
  after the linker's garbage collection. 144 of the 145 distinct executables
  have a name section; `compiler`, the process behind `cc`, has none and is
  not counted. A record stamped by reference is carried by these and by any
  executable whose only reference is in code the linker later drops, so the
  count is a lower bound; the four `-rdynamic` hosts keep every function by
  construction.
- 13 of 145 executables keep a socket function. By the number of images that
  hold each: `git` 37, `cmake` 12, `rustc-real` 6, `python` 5, `nvim` 4,
  `cargo` 3, `codex` 3, `emacs` 2, `zig` 2, `xonotic-sdl` 2, `pyrogenesis` 2,
  `lua` 1, `xonotic-dedicated` 1. `janis`, `curl`, Slop and the 88 commands of
  `/bin` keep none.
- 50 of 76 images hold one, and 41 of the 42 runnable ones: every runnable
  image except `default`. Without `git` it would be 31 and 23. The 26 without:
  `default`, `amy`, `cbindgen`, `cc`, `core`, `curl`, `display`, `dolly-docs`,
  `fd`, `gzip`, `javascript`, `llvm`, `llvm-runtimes`, `minicpm5-2b`,
  `pi-coding-agent`, `posix`, `protox`, the five `qwen3.5-*`, `ripgrep`,
  `sdl2`, `system-build`, `zlib`.
- What the 13 reach: `git` only `socket`, `connect`, `setsockopt` and
  `shutdown` (its `git://` transport); `xonotic` only datagram calls;
  `pyrogenesis` only `recv` and `send`; `cmake` libuv's `accept`. Four of them
  create a local socket today or after their port is upgraded (`python`,
  `nvim`, `codex`, and `emacs` for its server).
- Sealing refuses a retained executable whose record the recipe does not
  declare (`src/dollyfile.c`, `check_host_section`). `git` is in `system`, so a
  record by reference puts `REQUIRES HOST sockets@0` into 51 recipes (the 50
  and `default`, for `amy install git`) and into every recipe built on
  `system`: the custom images of `test/threads-browser.mjs`,
  `test/dso-browser.mjs` and their like, the examples of the Pi and Studio
  skills, and a user's own Dollyfile, which would stop sealing until the line
  is added.

Recommendation: no declaration; local sockets as core process operations, as
`spawn@0` was decided in `20261005-222449-spawn-users` (52 of 61 there). The
line would be in every runnable image and omitting it sheds no kernel import,
no trusted JavaScript and no browser authority: the kernel import list does
not change either way.

What is built, so that the owner's choice costs one commit either way: the
module `host/sockets/` with its manifest, contract, digest, kernel C and
client archive, and **no record in the client**. The kernel side is the same
for both answers.

- Declared module: add `DOLLY_HOST_REQUIRE(sockets, 0,
  DOLLY_SOCKETS_ABI_DIGEST)` to `host/sockets/client.c` and the line to the 51
  recipes and the test recipes above. The loader and sealing then enforce it
  with no further code.
- Core operations: nothing more is needed to run. Until the contract's bytes
  are folded into `include/dolly/process.h` (a new `dolly.process` digest), no
  stamp covers the layout of `sockets.h`; that move belongs in the next
  process-contract round.
- A declaration that would mean something needs an opt-in at link time, as
  `-rdynamic` is for `dso@0`: libc keeps refusals, a `cc` flag selects the
  client and its record, and each upgraded port passes it (about 15 recipes).
  It costs the 18 refusals kept beside the client, a driver flag and a link
  flag per port, Rust's linker included. Not built.

### Which ports match on `ENOSYS`

- Upstream sources of the ports (`.cache`: CPython, Git, Neovim, Zig's
  `std/posix.zig`, and the 1,645 crate archives Rust builds from, Codex's
  among them): none matches `ENOSYS` or Rust's `ErrorKind::Unsupported` on the
  result of a socket call. CPython's `accept4_works = errno != ENOSYS`
  (`Modules/socketmodule.c:3060`) only selects `accept`, which now exists.
- Dolly's own: `demos/rust/test/fixtures/rust/tokio/src/main.rs` asserts
  `ENOSYS` from `TcpStream::connect`; it becomes `EAFNOSUPPORT`.
  `demos/python/cpython-socket-stubs.c` returns `ENOSYS` itself and
  `demos/javascript` raises `ENOSYS` from its own JavaScript without calling
  libc: both are the port's to change when it is upgraded.
  `demos/rust/config/patches/tokio-target.patch` returns `ENOSYS` from
  `get_peer_cred`, which is a missing target arm, not a socket call's result.
- What `ENOSYS` hid: Zig's `std.posix.socket` has no arm for it ("unexpected
  errno"), and has one for `EAFNOSUPPORT`.

### A bound path

- WasmFS has no socket node and its file type cannot be changed after
  creation, so a bound path is an empty regular file that `bind` creates
  (`EADDRINUSE` when the name exists) and marks with the sticky bit. No
  process can set a mode bit (`chmod` only checks that the file exists), so
  the mark cannot be forged or cleared. `stat`, `lstat` and `fstat` report
  such a file as `S_IFSOCK`; `readdir` still says regular file.
- The listener keeps the file open, which pins its inode (WasmFS numbers
  inodes by object address), and `connect` finds the listener by the inode the
  path resolves to: a renamed path still connects, as on Linux.
- Unlinking the path removes the name only: connections and the listener go
  on, nobody new can connect, and the name can be bound again.
- When the listener's last descriptor closes or its process ends, the file
  stays, still `S_IFSOCK`, and `connect` gives `ECONNREFUSED`, as on Linux; a
  server removes a stale path before binding (asyncio does so only for a path
  that is a socket). A path that is no socket file also gives `ECONNREFUSED`,
  a missing one `ENOENT`.
- Snapshots record directories, files and links only: a socket file saved in
  a session or kept by an image comes back as an empty regular file. Images
  never retain `/tmp`.

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
