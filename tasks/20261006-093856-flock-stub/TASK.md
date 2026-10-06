# flock() reports a lock it never takes; Zig's cache depends on it

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
The work is on branch `fix/flock`.

## Design

- Semantics of BSD `flock()`: `LOCK_SH`, `LOCK_EX`, `LOCK_UN`; `LOCK_NB`
  answers `EWOULDBLOCK` instead of waiting. A lock belongs to the open file
  description, so descriptors made by `dup` or inherited by a spawned child
  share it. A bad descriptor is `EBADF`, an invalid operation `EINVAL`.
- Converting a held lock releases it and then requests the new one, as in
  Linux: the conversion may wait, is not atomic, and a refused `LOCK_NB`
  conversion leaves the description without a lock. Two shared holders that
  both ask for exclusive therefore cannot deadlock.
- One table in the kernel (`src/process-kernel.c`): a record per description
  that holds a lock, with the file's device and inode as the kernel's `fstat`
  reports them and whether it is exclusive. The kernel has no description
  objects: each guest descriptor holds its own kernel descriptor, duplicated
  in `copy_descriptor` for `dup` and for spawn. So each guest descriptor
  carries a description number, given at open and copied with it.
- Release: `LOCK_UN`, or `release_descriptor` closing the last descriptor
  that carries the number. Process exit and kill close every descriptor
  through `release_process_resources`, so a dead Worker's locks go with it.
- A request that must wait returns `DOLLY_PROCESS_DISPATCH_DEFERRED`, as a
  blocking pipe read does. The supervisor retries parked calls every 16 ms
  and at once when a system call sets the kernel's wakeup flag
  (`dolly_process_take_wakeup`), which a release now sets; a signal ends the
  wait with `EINTR` like any parked call. No queue: waiters are not ordered.
- Contract: one operation in `include/dolly/process.h` and a strong `flock`
  in `src/process/libc-adapter.c` over Emscripten's weak stub. A process ABI
  change: every executable is restamped and the Rust seed rebuilt.
- Not in this batch: byte-range locks (`fcntl`, `lockf`). They already fail
  honestly (below) and their callers take the failure: SQLite in Codex and
  rustc's incremental sessions.

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

- `flock` locks: a browser test in the process suite has two processes
  contend for one file (exclusive waits for exclusive, shared joins shared,
  `LOCK_NB` reports `EWOULDBLOCK`, the waiter proceeds on unlock, on close
  and when the holder is killed) and a spawned child share its parent's lock.
- `zig-build` and `ghostty-build` still build, and the `default` chain.
