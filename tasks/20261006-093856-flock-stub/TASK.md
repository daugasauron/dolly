# flock() reports a lock it never takes; fcntl locks are refused

- STATUS: OPEN
- PRIORITY: 230
- TAGS: bug,libc,kernel,locks

Found on the Cargo track (2026-10-06, `tasks/20260930-231102-cargo-native`).

## Measured (Chrome, `rust-build` image)

`build/cargo-evidence/serve/flock-check.c` takes `LOCK_EX | LOCK_NB` through two
open file descriptions of one file, then on descriptor -1:

    flock a=0 (Success) b=0 (Success) bad=0 (Success)
    fcntl F_SETLK=-1 (Not supported)
    lockf=-1 (Not supported)

`flock` is the weak stub in Emscripten's `emscripten_libc_stubs.c`
(`libstubs.a`): it returns 0 for any argument. `AGENTS.md`: an unimplemented
operation cannot return success.

## Why it is not simply made to fail

A strong `flock` in `src/process/libc-adapter.c` answering `ENOTSUP` (`EBADF`
for a bad descriptor) is eight lines, and was built and tried: `zig-build`
still builds, `ghostty-build` then fails at its first Zig compile,

    /usr/lib/zig/std/std.zig:1:1: error: unable to load 'std.zig': Unexpected
    make: *** [/tmp/ghostty/Makefile:6: /tmp/ghostty/ghostty-vt.c] Error 1

(`build/cargo-evidence/image-1.log`). Zig 0.16 locks every file of its
compilation cache (`src/Zcu/PerThread.zig`, `lib/std/Build/Cache.zig`) and has
no path without locks outside WASI: `lib/std/Io/Threaded.zig` maps `EOPNOTSUPP`
to `error.FileLocksUnsupported`, which nothing handles. So every image with a
terminal depends on the stub today. The change was reverted.

Other callers in the pinned sources, by reading: CPython `fcntl.flock`
(stdlib user: `mailbox` only; pip 26.2.1 has none), Neovim `fileio.c`
(tempdir, result ignored), Emacs `movemail.c` only, Codex
`app-server-daemon/src/backend/pid.rs`. None found in Git, GNU Make, CMake,
libuv, QuickJS, curl, awk, bison, llama.cpp, SDL2 or the 0 A.D. engine.
SQLite and rustc's incremental sessions use `fcntl` locks, which already
answer `ENOTSUP`.

## Options

- Advisory locks in the kernel: a lock per file, owned by an open file
  description, released at its last close. This needs a new process call, so
  a `process.h` change and a rebuilt Rust seed. It would also let Cargo and
  rustc lock (`CARGO_INCREMENTAL`), and SQLite if `fcntl` locks come with it.
- Or a Zig change that skips cache locks on this target, then the eight-line
  honest `flock`.

## Decision (2026-10-06, integrator; taken over by `fix/userspace-2`)

Implement it in the kernel. The owner delegated such decisions ("go with the
answer that aligns with the goal of the project"): a Zig patch would be a
source fork for one program and would leave CPython, Neovim, Emacs and Codex
with a call that cannot lock, while the kernel already owns descriptors,
files and parked calls.

It does not ride the seed round of 2026-10-06: the change needs `process.h`,
so two passes of runtime, Rust seed and image chain before it is verified.
Until it ships, **`flock` is a known false success**: it returns 0 without
locking anything, also for a bad descriptor or operation (measured below).
To be implemented with the next process-ABI round, together with
`tasks/20261002-072000-input-host-module`.

## Design (2026-10-06 night, `core/file-locks`)

Scope widened by the integrator: whole-file locks (`flock`) and POSIX
byte-range locks (`fcntl`, and `lockf` above it) as one design. SQLite takes
`fcntl` locks, so every Cargo run printed "failed to save last-use data: disk
I/O error" (`SQLITE_IOERR_LOCK`), and GNU Make's `-O` warned that it had no
lock.

### Contract

One operation, `DOLLY_PROCESS_FD_LOCK = 57`, with a 32-byte request
(descriptor, flags, type, whence, start, length) and a 24-byte response for
the test (type, pid, start, length). Types: shared, exclusive, unlock. Flags:

- `DESCRIPTION`: the lock covers the whole file and belongs to the open file
  description (`flock`). Without it the lock covers a byte range and belongs
  to the process (`fcntl`); the kernel resolves `whence` against the
  descriptor's offset or the file's size, so the request is atomic.
- `WAIT`: park instead of `EAGAIN` (`flock` without `LOCK_NB`, `F_SETLKW`).
- `TEST`: change nothing and report a lock that would refuse the byte-range
  request (`F_GETLK`).

`process.h` gains the operation number, two enums, two packets and their two
layout checks; `abi/` does not change. It is a process ABI change: every
executable is restamped and the Rust seed rebuilt.

### Semantics

- `flock`: `LOCK_SH`, `LOCK_EX`, `LOCK_UN`, `LOCK_NB` (`EWOULDBLOCK`). The
  lock belongs to the description, so descriptors made by `dup` or inherited
  by a spawned child share it; it goes at `LOCK_UN` or when the last
  descriptor of the description closes. Converting a held lock gives it up
  before the new one is requested, as on Linux: the conversion may wait, is
  not atomic, and a refused `LOCK_NB` conversion leaves no lock. Two shared
  holders that both ask for exclusive therefore cannot deadlock. A bad
  descriptor is `EBADF`, an invalid operation `EINVAL`.
- `fcntl` `F_SETLK`, `F_SETLKW`, `F_GETLK` with `F_RDLCK`, `F_WRLCK`,
  `F_UNLCK`: ranges from `SEEK_SET`, `SEEK_CUR` or `SEEK_END`, a zero length
  to the end of the file and beyond, a negative length ending at the start.
  The process owns the lock. A range it already holds is retyped in place:
  locks split, shrink and merge, and a refused request changes nothing (SQLite
  keeps its shared lock when the upgrade is refused). `F_RDLCK` needs a
  descriptor open for reading and `F_WRLCK` one open for writing (`EBADF`).
  A conflict is `EAGAIN`. POSIX's rule is implemented as written: closing
  **any** descriptor of a file drops every lock the process holds on that
  file, also one taken through another descriptor. A spawned child inherits
  none.
- The two kinds do not see each other, as on Linux. Both are advisory:
  `read` and `write` never look at them.
- `lockf` is musl's, over `fcntl`. `F_OFD_*` stays `EINVAL`: nothing in the
  catalog asks for it. Read in `libsqlite3-sys` 0.38.1 (SQLite 3.53.2, the
  copy Cargo bundles; `SQLITE_ENABLE_LOCKING_STYLE` 0 and no
  `SQLITE_ENABLE_SETLK_TIMEOUT` in its `build.rs`): the unix VFS calls only
  `fcntl(F_SETLK)` and `fcntl(F_GETLK)` with `SEEK_SET` ranges.
- No deadlock detection: `F_SETLKW` never answers `EDEADLK` (POSIX lists it
  under "may fail"). Waiters are not recorded in the kernel, because the
  supervisor ends a parked call on a signal without telling it, so a wait
  graph would go stale. A deadlocked wait ends on a signal, like any parked
  call.
- A pipe has no file to lock: `EINVAL`.

### Kernel

- One static table of 1024 locks for all processes
  (`DOLLY_KERNEL_LOCK_LIMIT`, 48 KiB); a request that would need a 1025th
  answers `ENOLCK` and changes nothing, an unlock that splits a range
  included. Nothing is allocated per request, so no guest size reaches an
  allocation. An entry is the file (device and inode of the kernel's
  `fstat`), the owner (description number or pid), the range and whether it
  is exclusive. A whole-file lock is the range from 0 to the end.
- The kernel has no description objects: each guest descriptor holds its own
  kernel descriptor, duplicated in `copy_descriptor` for `dup` and spawn. So
  each guest descriptor carries a 64-bit description number, given at open
  and copied with it.
- `release_descriptor` drops the process's byte-range locks on the closed
  file, and the description's lock when no descriptor of any process carries
  its number any more. Exit, kill and Worker death close every descriptor
  through `release_process_resources`, so a dead process's locks go with it.
- A request that must wait returns `DOLLY_PROCESS_DISPATCH_DEFERRED`, as a
  blocking pipe read does. The supervisor retries parked calls every 16 ms
  and at once when a system call sets the kernel's wakeup flag
  (`dolly_process_take_wakeup`), which a release now sets. A signal ends the
  wait with `EINTR`; a handler with `SA_RESTART` restarts it. No queue:
  waiters are not ordered, so a writer can starve behind readers.
- libc (`src/process/libc-adapter.c`): a strong `flock` over Emscripten's weak
  stub, and the three `fcntl` commands.

## Measured (2026-10-06, Chrome, `default`, runtime `5439ebe7…`)

`build/userspace2-evidence/probe-locks.log`; two opens `a` and `b` of one
file, `d = dup(a)`:

    flock a EX|NB=0  flock b EX|NB=0  flock -1=0  flock a 99=0
    fcntl F_SETLK, F_SETLKW, F_GETLK = -1 (Not supported)
    fcntl F_OFD_SETLK = -1 (Invalid argument); F_SETLK on -1 = -1 (Bad file descriptor)
    lockf F_TLOCK, F_LOCK, F_TEST, F_ULOCK = -1 (Not supported)

File identity is usable as the key: `a`, `b` and `d` report the same device
(1) and inode; the inode survives `rename` and `unlink` while a descriptor
is open; another file has another inode. A file created after every
descriptor of the first is closed can get its inode again, when no lock on
it can exist any more.

## Done when

- A browser test in the process suite has two processes contend for one file
  with both kinds: exclusive waits for exclusive, shared joins shared, a
  non-waiting request reports the conflict, the waiter proceeds on unlock, on
  close and when the holder is killed; a spawned child shares its parent's
  `flock`; `fcntl` ranges overlap, abut and split; `F_GETLK` names the holder.
- `zig-build` and `ghostty-build` still build, and the `default` chain.
- SQLite locks a database from two processes without `SQLITE_IOERR_LOCK`.
