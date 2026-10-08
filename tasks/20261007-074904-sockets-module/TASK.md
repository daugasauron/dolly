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

Owner (2026-10-08, later, settling it): "git with 3rd, declared only by
programs that require only at link time. Things that don't need it to run
shouldnt require it." So the declaration is an opt-in at link time: libc
keeps the refusals, a link flag selects the socket client and its stamp, and
only the programs that need local sockets to run pass it and have
`REQUIRES HOST sockets@0` in their image. `git` does not. Branch
`core/sockets-optin`.

## State (2026-10-08, `core/sockets-module`)

Steps 1 and 2 of the proposal are built and pass their tests in Chromium and
Firefox; libuv, CPython, Tokio and crossterm are upgraded and proven on a
chain of 27 images; Janis is kept as it is, with its reason. The sections
"Settled before code", "Built" and "Ports, run" hold the measurements.

- Decided by the owner (2026-10-08) and built on `core/sockets-optin`: a
  program asks for the module when it links, and only then records it
  ("Opt-in at link time", below). What "Settled before code" and "Built" say
  of a client without a record describes `core/sockets-module`, the step
  before.
- The catalog round's: every image on the new seed, the Rust seed relinked,
  the Codex chain and the Rust demo test ("What the catalog round must do").
- Open: Janis `net` on a path, when a program needs it.

## As filed (2026-10-07)

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
- Snapshots record directories, files and links only (`src/fs-record.h`), so
  a socket file saved in a session or kept by an image should come back as an
  empty regular file; this was read, not run. Images never retain `/tmp`.

## Built (2026-10-08, `core/sockets-module`)

### The module

- `host/sockets/`: `dolly-sockets-0.wat` (ten operations, 160 to 169, and
  their flags), `sockets.h` (two packets), `kernel.c`, `client.c`,
  `module.json`, `sockets.mjs` (the digest; there is no page or Worker side).
  No import: `validate-browser` passes on the unchanged
  `abi/dolly-browser-0.wat`, and the suite compares the kernel's import list
  with the nine names.
- A socket is a descriptor kind of the kernel's table beside files, pipes and
  the terminal (`src/process-kernel.c`): `read`, `write`, `poll`, `close`,
  `dup`, `fcntl`, `fstat` and inheritance through spawn are the process
  contract's own operations, which pass a socket on to the module. The module
  holds what a socket is: unconnected, listening or connected, its peer, its
  64 KiB of unread bytes, its bound file and its backlog.
- The libc calls are the module's client (`libdolly-sockets.a`), in place of
  the 18 `ENOSYS` stubs of `runtime-adapter.c`. Network families
  (`EAFNOSUPPORT`), datagram and seqpacket types (`EPROTOTYPE`) and protocols
  (`EPROTONOSUPPORT`) are refused there: the contract has no way to ask for
  one. Control data on `sendmsg` (descriptor passing) is `ENOTSUP`; an
  abstract name is the empty path, `ENOENT`; `setsockopt` is `ENOPROTOOPT`.
- Added because a port needs it: `SOCK_NONBLOCK` and `SOCK_CLOEXEC` on
  `socket`, `socketpair` and `accept4` (mio, libuv, CPython); `MSG_DONTWAIT`
  (signal-hook's wake from a handler) and `MSG_NOSIGNAL`; `getsockname`,
  `getpeername` and `SO_TYPE` (libuv's `uv_guess_handle`); `SO_ERROR`, always
  zero since `connect` completes or fails at the call (Tokio reads it after
  every connect). Not added: `MSG_PEEK`, `MSG_WAITALL`, `SO_PEERCRED`, other
  options.
- Quotas, in the kernel (`host/sockets/kernel.c`): 128 sockets in any state
  (`ENFILE`; a connection is two, so 8 MiB of buffers at most), 16
  connections a listener holds unaccepted (`listen` clamps to 1 to 16; a
  blocking `connect` waits for room, a nonblocking one gets `EAGAIN`), 64 KiB
  unread a direction, 107 bytes a path. A socket goes with its last
  descriptor, and a process's descriptors close when it exits, aborts, traps
  or is terminated: the module keeps no state per process.
- Unlike Linux: a backlog of N holds N connections, not N + 1; a connection
  the listener never accepted ends as a closed peer (end of file, `EPIPE`)
  when the listener goes, not with `ECONNRESET`; `readdir` reports a socket
  file as a regular file; opening one as a file gives an empty file, not
  `ENXIO`.
- An `-rdynamic` host exports the socket calls to the libraries it loads, as
  it did the stubs: `scripts/prepare-process-sysroot.sh` takes the client's
  names into `dynamic-provider.symbols`. Found by the proving chain: without
  it `luv.so` failed to load in `lua` ("undefined symbol: getsockopt") and
  stopped `neovim-build`, and the cmake test's libuv library failed alike.

### Evidence

Logs are in `build/sockets-evidence/` (ignored). Browser commands ran through
`work/slot.sh browser`, image builds through `work/slot.sh build` with
`DOLLY_IMAGE_JOBS=1`.

- `npm run build:runtime`: 1 min 1 s with the module (57 s after a client
  change); `validate-browser` passes: "dist/dolly.wasm has exactly the typed
  imports in build/dolly-browser-0.wasm". Image inputs `1dbe7a21…` (were
  `c62b2710…`; the seed changed once more, to `01da8fef…`, below). A
  kernel-only change afterwards rebuilds in 11 s and keeps the hash, so the
  images stay valid.
- `host/sockets/kernel.c` compiled natively against a stand-in descriptor
  table (`native/harness.c`, AddressSanitizer and UBSan): pair, wrap of the
  ring, shutdown, close, named connect, backlog, rename, a dying listener,
  the quota.
- `test/fixtures/sockets.c` compiled natively on Linux 6.8 with a stub for
  the raw calls: its `pair`, `peer`, `sigpipe`, `server` and `client` modes
  pass unchanged, so those expectations are Linux's. `stale` matches up to
  its Dolly path, `backlog` up to the two differences recorded above.
- Images: `default,system,cc` and what they need (14 images: `system-build`,
  `core`, `zlib`, `gzip`, `curl`, `zig-build` 475 s, `ghostty-build`,
  `display`, `system-tools`, `posix`, `amy`, `default`, `cc`, `system`) in
  12 min 41 s, exit 0.
- `node test/sockets-browser.mjs chromium firefox` on `system`: passed in
  6.1 s and 5.3 s. What it shows:

  | Claim of the task | Mode of `test/fixtures/sockets.c` |
  | --- | --- |
  | Bytes both ways over a pair inherited through spawn | `pair`: 300 KiB each way to a child holding one end as descriptor 3, through `poll`; a handler wakes its loop with `send(MSG_DONTWAIT)` |
  | A server and a client that share no pipe connect through a path | `server PATH &` and `client PATH`, both started by the shell |
  | Peer exit gives end of file to a waiting reader and `EPIPE` to a writer | `peer`: a child that exits while the parent waits in `poll`, and one in a CPU loop that is killed; `sigpipe` ends with status 141 |
  | A dead listener gives `ECONNREFUSED` | `stale`, on the path the server left; also `EADDRINUSE` until unlinked, `ENOENT` after, a renamed path still connects |
  | `poll` wakes on readable, writable, a pending connection and hangup | `server` (waits for a connection), `peer` (waits for the hangup), `backlog` (each state) |
  | Exhausting a quota fails with an errno; exit, abort and forced termination release | `quota`: 64 pairs then `ENFILE`; again 64 after exit, after `abort` (status 126) and after `timeout 1` ends a CPU loop (124); `backlog`: `EAGAIN` |
  | `socket(AF_INET, ...)` and `AF_INET6` fail | `refuse`: `EAFNOSUPPORT`; datagram and seqpacket `EPROTOTYPE`; an abstract name `ENOENT`; `SCM_RIGHTS` `ENOTSUP` |
  | The kernel's import list is unchanged | the suite compares the imports of `dist/dolly.wasm` with the nine names |

- `node test/browser-tests.mjs chromium` (5 min 49 s): every suite passes
  except seven that need what this chain did not build or cannot run under
  the slot's cap: `amy`, `default` and `man` (the `git` and `python`
  packages), `audio` (`audio-sdk`), `gpu-indicator` (`gpu-sdk`), `docs`
  (`dolly-docs`), and `fs-growth`, which fills 8 GiB and is killed by the
  browser slot's 6 GiB memory cap (`journalctl -k`: "Memory cgroup out of
  memory").
- Firefox: `process`, `core`, `threads`, `dso`, `host-modules`, `boundary`,
  `cpp` and `shell` pass.
- Source: `node --test 'test/*.test.mjs'`, 335 of 335; lint, 76 recipes.

### What the first port chain found (image inputs `1dbe7a21…`)

`DOLLY_BUILD_IMAGES=default,system,cc,git,audio-sdk,gpu-sdk,dolly-docs,python,rust,cmake-build,cmake,neovim`:
27 min 54 s, exit 1. Built: `audio-sdk`, `cmake-build` (22 min 10 s),
`cmake`, `dolly-docs`, `git`, `gpu-sdk`, `python` (114 s), `rust-sdk`,
`rust-build`, `rust`. Two defects, both fixed before the chain below:

- `neovim-build` stopped at `lua /tmp/luv/check.lua`: "error loading module
  'luv' ... undefined symbol: getsockopt", and the cmake demo test stopped at
  its libuv library the same way after its CMake half and the libuv probe had
  passed. A host built `-rdynamic` exports libc to the libraries it loads from
  the names in `dynamic-provider.symbols`; the socket calls were in that list
  only through `libdolly-runtime.a`. `scripts/prepare-process-sysroot.sh` now
  reads the sockets client too. This changes the seed: image inputs
  `01da8fef…`.
- The python demo test stopped at `socket.socketpair()`: CPython's Emscripten
  site file denies `sys/un.h`, `socketpair` and `shutdown`, so `_socket` had
  no `AF_UNIX` and Python's fallback pair asked for `AF_INET`.
  `demos/python/prepare-cpython.sh` restores the three in `pyconfig.h`, as it
  does `alarm` and `setitimer`.
- Passed on those images: the Rust probe below (74 s in Chromium), and the
  libuv probe on `system` in Chromium (13.5 s) and Firefox (10.8 s).

## Opt-in at link time (2026-10-08, `core/sockets-optin`)

Owner: "declared only by programs that require only at link time. Things that
don't need it to run shouldnt require it."

- libc refuses every socket call with `ENOSYS`, as on `main`
  (`src/process/socket-refusals.c`, the 18 stubs unchanged), and records
  nothing. `git`, `cmake`, `nvim`, `zig` and the rest are what they were.
- A program asks with the library flag: `cc ... -ldolly-sockets`. The client
  (`host/sockets/client.c`) then replaces the refusals and carries the
  `sockets@0` record; sealing and the loader enforce `REQUIRES HOST
  sockets@0` as for every module. No operation and no kernel code changed.
- Why the plain flag is reliable. `cc` no longer adds this one client to the
  archives it links by default (`host_client_libraries`, `src/compiler.cpp`),
  so the archive is on the link line only when the program names it, and
  then before every archive `cc` adds (a `-l` argument is an input). The
  linker takes a name from the first archive that defines it, whichever
  object or later archive member refers to it. The refusals are an object of
  their own in `libdolly-runtime.a` that defines the same 18 names and
  nothing else, so a link takes the client or the refusals, never both: with
  the stubs inside `runtime-adapter.o`, as on `main`, a program that also
  spawns would have defined each call twice. An `-rdynamic` host exports
  whichever it linked to its libraries.
- Ports that ask, because they need a local socket to run:
  - CPython (`LIBS=-ldolly-sockets`): `_socket`, asyncio's wake-up pair.
  - Codex (`demos/codex/config/patti.toml`, both binaries): Tokio's signal
    driver and crossterm's wake pairs, now upstream's `UnixStream` pairs. Not
    built here.
  - The Tokio probe of the Rust demo test, by the same Patti option.
  - Not libuv's users: CMake and Neovim run without (their stdio pipes are
    one-way; Neovim's server socket fails as on `main`). A program that wants
    libuv's two-way or named pipes links the flag, as the cmake test's probe
    does. Not Emacs: its server was not part of this task.
  - The Rust seed's link has no client, and `dolly-rust-link` adds none: a
    Rust program asks with `-C link-arg=-ldolly-sockets`.
- Recipes that declare `sockets@0` (ten): `python`; `llvm-tablegen`,
  `llvm-build`, `llvm-cc` and `zero-ad-spidermonkey`, which keep `python`;
  `codex-build`, `codex-cli`, `codex`; `default` (for `amy install python`)
  and `rust-tools` (a shell for building such programs), by the rule that
  gave them `dso@0`.

### Run (image inputs `fba70aaf…`, runtime `1f0a68d9…`)

- `npm run build:runtime`: 55 s, `validate-browser` passes. Chain
  `default,system,cc,python,rust`: 18 images in 17 min 47 s, exit 0.
- By the record, on those 18 images (`build/sockets-evidence/scan-socket-references.mjs`):
  only `/usr/bin/python` carries `sockets@0`. `git`, `zig` and `rustc-real`
  keep their socket calls, the refusals, and no record.
- Chromium and Firefox, once each, all passed: `sockets` (programs linked
  with the flag in `system` plus the module), `sockets not declared` (a
  program linked without the flag runs in `system` and gets `ENOSYS`; one
  linked with it is refused there, status 126, naming the module; a recipe
  that keeps one without the line does not seal), `cpp`, `process`,
  `threads`, `dso` (its library calls `socket` through its owner: the
  refusal).
- Chromium: `npm run test:demos -- python` (27.3 s); the Tokio and crossterm
  probe built by Patti with the link option, on `system` plus `rust` plus the
  module (71.3 s); the libuv probe linked with the flag (10.6 s).
- Source: 416 of 416; lint, 76 recipes.
- Not run on this seed: `cmake-build` and the cmake and neovim demo tests
  (their link lines did not change; the cmake test's probe now links the flag
  and its image adds the module), the Rust demo test (`rust-tools`, `cargo`),
  the Codex chain, and every image outside the 18.

### What the release round must do

- `npm run build:runtime` and every image: the seed changed (the refusals,
  the client's record, `cc`'s default archives).
- `demos/rust/build-rust-toolchain.sh`: relinks `rustc-real` because the
  sysroot changed; `link.sh` is `main`'s again, without the client.
- The Codex chain (`codex-build`, `codex-cli`, `codex`): Tokio without the
  signal patch, the shorter crossterm patch, both binaries linked with
  `-ldolly-sockets`, the three recipes declaring `sockets@0`. None of this
  was built here; a Codex binary that failed to link the client would abort
  in Tokio's signal driver ("failed to create UnixStream").
- `llvm-tablegen`, `llvm-build`, `llvm-cc`, `zero-ad-spidermonkey`,
  `rust-tools`: rebuilt with their new line; sealing names any image that
  keeps `python` or `codex` without it.
- `npm run test:demos -- rust cmake neovim` and the Codex demo test.

## Upgrading the ports

For each entry under Today: remove the workaround, rebuild the image, run its
demo test. A workaround that is still needed stays, with the reason recorded
here. Step 1 should retire the tokio and crossterm substitutions and libuv's
two-way pipe refusal; step 2 allows Janis and Python servers and clients on a
path. Network calls keep failing in all of them.

### What was decided for each port (2026-10-08)

Results of the rebuilt images and demo tests follow under "Ports, run".

| Port | Workaround | Decision |
| --- | --- | --- |
| Tokio | `tokio-signal-pipe.patch` | Removed: the signal driver is upstream's `UnixStream::pair()` again |
| crossterm | `crossterm.patch`, `UnixStream` hunks | Removed: the SIGWINCH and wake pairs are upstream's. The patch keeps its one other hunk, which reads the terminal's readiness with `poll` because the terminal has no `FIONREAD`; that is no socket matter |
| Codex | `demos/codex/config/tui-events.patch` selects crossterm's `use-dev-tty` source | Kept: the default source (signal-hook-mio) would now find its socket pair, but which source Codex's TUI runs on is Codex's to change and to test in its own image |
| Tokio, mio, socket2 | `tokio-target.patch`, `mio.patch`, `socket2.patch` | Kept, read hunk by hunk: they name the target (the `poll(2)` selector since there is no epoll, the pipe waker since there is no eventfd, `pipe2` and `accept4` flag lists, the `socket2` dependency and the wasm feature gate). None exists because a socket call failed. `get_peer_cred` still returns `ENOSYS`: tokio has no arm for this target and `sockets@0` offers no peer credentials |
| libuv | `process.c` refused a stdio pipe that is both readable and writable | Removed: such a pipe is `uv_socketpair`, as upstream makes every stdio pipe; one direction stays a kernel pipe. Kept: an IPC pipe is `UV_ENOTSUP`, because it passes descriptors |
| CPython | `_socket` compiled against `dolly_socket_stubs.c` | Removed for the twelve calls the libc now has (`accept`, `accept4`, `bind`, `getpeername`, `getsockname`, `getsockopt`, `listen`, `recvfrom`, `recvmsg`, `send`, `sendmsg`, `sendto`). Kept: the stubs for name resolution, interfaces and `inet_*`, which no local socket needs |
| Janis | `net`, `http` and `https` raise `ENOSYS` from JavaScript; no IPC | Kept. What its users ask for is a TCP listener (`listen(1455)` for Pi's sign-in) and TCP clients, which stay refused; nothing in the catalog asks Janis for a path. Janis calls no libc socket function at all, so `net` on a path is new adapter code (three native calls, a duplex stream and a server in its event pump, cases for the Node oracle), to be written when a program needs it |

### Ports, run (image inputs `01da8fef…`, runtime `fa012a7a…`)

`DOLLY_IMAGE_JOBS=1 DOLLY_BUILD_IMAGES=default,system,cc,git,audio-sdk,gpu-sdk,dolly-docs,python,rust,cmake-build,cmake,neovim
work/slot.sh build npm run image`: 27 images in 54 min 45 s, exit 0, while a
catalog round ran in another worktree (`cmake-build` 27 min 6 s,
`neovim-build` 3 min 51 s, `python` 2 min 6 s, `zig-build` 9 min 7 s, the
three Rust images under 45 s each with the existing seed). `npm run
build:runtime` afterwards prints the same two hashes.

| Port | Image rebuilt | Run |
| --- | --- | --- |
| libuv | `cmake-build`, `cmake`, `neovim-build`, `nvim`, `neovim` | `npm run test:demos -- cmake`: passed (23.7 s): CMake, then the probe with a child on a two-way pipe (`uv_guess_handle` names it a pipe, `uv_shutdown` gives the child end of file) and libuv's server and client on a named pipe, then libuv as a library in an `-rdynamic` host. `npm run test:demos -- neovim`: passed (7.8 s). The probe alone on `system`: Chromium and Firefox |
| CPython | `python` | `npm run test:demos -- python`: passed (29.2 s); `python-sockets.py`: `AF_INET` and `AF_INET6` are `EAFNOSUPPORT`, `socket.socketpair()`, and `asyncio.run` of a Unix server and client at a path |
| Tokio, crossterm | `rust-sdk`, `rust-build`, `rust` (the existing seed, not relinked) | `build/sockets-evidence/tokio-probe.mjs`, the demo test's Tokio fixture on `system` plus the `rust` package (the demo test's own image, `rust-tools`, needs `cargo`): Patti builds Tokio 1.52.3 without the signal patch and crossterm with the reduced patch; the probe reads a resize through crossterm (`use-dev-tty`, as Codex builds it), a signal through Tokio's driver, `EAFNOSUPPORT` from a TCP connect, and a `UnixListener` and `UnixStream` at a path, twice. Chromium 68 s, Firefox 82 s |

- `node test/browser-tests.mjs` on these images: Chromium 7 min 19 s,
  Firefox 15 min 16 s; 32 suites pass in each, `sockets` among them and `dso`
  with its library making a socket call through its owner. Two fail in both,
  neither on a socket: `amy`, whose second block runs `amy install sdl2`, a
  package this chain did not build (its first block passes); and `fs-growth`,
  which fills 8 GiB under the browser slot's 6 GiB cap. Chromium is killed
  there (`journalctl -k`, 09:36:13: "Memory cgroup out of memory: Killed
  process ... (chrome) ... anon-rss:6019808kB"); Firefox ran into the test's
  300 s limit instead, with no kernel line, and was not attributed further.
- `node --test test/dolly.artifacts.mjs`: 16 of 16, among them that no kernel
  import is named for a socket. Source: 416 of 416 (`test/` and `demos/`).
- The scan again, on these 27 images: the same executables keep a socket
  function as before the change (`rustc-real`, `cmake`, `git`, `lua`, `nvim`,
  `python`, `zig`), no other.

Not run: the Rust demo test itself (`rust-tools` needs the `cargo` image),
the Codex chain, `javascript`, `emacs`, and every image outside the 27. The
Rust seed was not relinked: `rustc-real` in these images still holds the
stubs it was linked with, which it never calls.

### What the catalog round must do

- `npm run build:runtime`, then every image: the seed changed (the libc's
  socket calls, the provider symbol list, two headers).
- `demos/rust/build-rust-toolchain.sh`: its input key hashes the sysroot, so
  it relinks `rustc-real`. `demos/rust/toolchain/link.sh` gained
  `-ldolly-sockets`, which the provider symbol list now roots; that link was
  not run here (this worktree holds the seed's tarball, not its build tree).
- Rust images whose sources changed: `codex-build`, `codex-cli`, `codex`
  (`demos/codex/prepare-codex-sources.py` no longer applies the Tokio signal
  patch and applies the shorter crossterm patch; their source pins move in
  the round's own preparation). Every other Rust image (`rust-sdk`,
  `rust-build`, `rust`, `rust-tools`, `cargo`, `cbindgen`, `ripgrep`, `fd`,
  `protox`) rebuilds for the seed alone.
- `npm run test:demos -- rust` (its fixture now needs crossterm's crates from
  the Codex sources) and the Codex demo test.

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
