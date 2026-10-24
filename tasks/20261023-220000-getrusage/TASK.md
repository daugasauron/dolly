# Emscripten's libc stubs that claim success: getrusage, times and the rest

- STATUS: OPEN
- PRIORITY: 160
- TAGS: core,libc,0.1.4

Found by the OCaml port (2026-10-23, `tasks/20261023-210000-ocaml/TASK.md`): `getrusage`
returns 0 with a user time of 1.000002 s whatever the process did, and `times` reports 0.
Neither is in Dolly's adapter (`src/process/runtime-adapter.c`): they are Emscripten's stubs.
AGENTS.md: "an unimplemented operation cannot return success". OCaml's `Sys.time` now reads
the clock instead (its patch); other ports may trust the invented value.

Fix: the adapter answers `getrusage` and `times` with `ENOSYS` (Dolly accounts no CPU time),
or with real numbers if the kernel ever accounts them. It is a seed change, so it rides the
next catalog round, not 0.1.4's.

Also from the port: `posix_spawn_file_actions_addclose` works since `core/process-exec`
(`tasks/20261006-214244-process-exec`), and the libc has no `gethostbyaddr` (OCaml raises
`Not_found`; no change planned).

## State (2026-10-23, night): the stubs taken over on `core/process-exec`

Done and checked in Chromium and Firefox (`test/process-browser.mjs` runs
`process-lifecycle.c`, which checks every change below, on `system` built on the new
seed). OCaml's workaround is gone: `demos/ocaml/prepare-ocaml.sh` no longer states
`getrusage` and `times` absent, and its test checks that `Sys.time` and `Unix.times`
advance (rebuilt on the new seed, where configure now finds both: `ocaml-browser.mjs` passed in
Chromium 5.5 s and Firefox 7.6 s, `fixpoint-browser.mjs` in Chromium 224 s, Firefox `make
world` 96 s and `make bootstrap` 131 s). Left: `mprotect` and the process-group stubs below still
answer success without doing it, each with its reason, and the catalog round is what
shows every port still passes.

`scripts/prepare-process-sysroot.sh` drops `emscripten_libc_stubs.o` from the staged
`libstubs.a`; `src/process/libc-stubs.c` (in `libdolly-runtime.a`, linked only when used)
defines what it held, and musl's `getdate` is compiled beside it. `emscripten_syscall_stubs.o`
stays: every one of its definitions is weak, so an adapter definition replaces it.
Checks in `test/fixtures/process-lifecycle.c`.

`emscripten_libc_stubs.o`, every definition:

| Symbol | Emscripten | Dolly now | Why |
| --- | --- | --- | --- |
| `times` | zeros, returns 0 | getrusage's times in clock ticks, elapsed monotonic ticks | it claimed no time passed |
| `waitid` | `ECHILD` always | `waitpid` for `P_PID`/`P_ALL` with `WEXITED` (and `WNOHANG`); `EINVAL` otherwise | it denied children that exist; no child stops, nothing is left waitable (`WNOWAIT`) |
| `getloadavg` | 0.1, 0.1, 0.1 | -1 | no load average is kept |
| `getdate` | `NULL`, no `getdate_err` | musl's: `DATEMSK` templates, `getdate_err` | upstream's code, and `getdate_err` now links |
| `getpwent`, `getgrent` | `NULL` with `EIO` | `NULL` | an empty database ends, it has no I/O error |
| `chroot` | `EACCES` | `EPERM` | the one user holds no privilege; no path was refused |
| `getpwnam`, `getpwuid`, `_r`, `getgrnam`, `getgrgid`, `_r` | not found (`ENOENT`) | same | one user, id 0, no user database |
| `setpwent`, `endpwent`, `setgrent`, `endgrent` | nothing | same | nothing to rewind |
| `stime` | `EPERM` | same | the clock is the browser's |
| `clock_getcpuclockid` | own pid only | same | the CPU clock is the time since the program started |
| `setgroups` | `EPERM` (`EINVAL` past the limit) | same | no privilege |
| `sigaltstack` | `ENOSYS` | same | handlers run on the interrupted call's stack |
| `dlopen`, `__dlsym` | `NULL`, "dynamic linking not enabled" | same, naming `-rdynamic` and `dso@0` | code `cc` did not map to the `dso@0` client (Rust's `dlsym`) |
| `fork`, `vfork` | `ENOSYS` | same, in `runtime-adapter.c` | no copy of a process |
| `execve` | `ENOEXEC` | the real exec (`tasks/20261006-214244-process-exec`) | |
| `posix_spawn`, `popen`, `pclose`, `flock` | stubs | Dolly's own already | |

`emscripten_syscall_stubs.o`, every definition a Dolly program reaches:

| Symbol | Emscripten | Dolly | Why |
| --- | --- | --- | --- |
| `getpid`, `getppid`, `getrusage`, `madvise`, `prlimit64`, `wait4` | stubs | Dolly's | |
| `uname` | "Emscripten" | unreachable: Dolly's `uname` | |
| `sync` | success | kept | the filesystem is kernel memory: nothing waits to be written |
| `getgroups32`, `getresuid32`, `getresgid32` | group 0, ids 0 | kept | true: one user, id 0, group 0 |
| `getpriority` / `setpriority`, `setdomainname` | 0 / `EPERM` | kept | every process runs at 0; nothing may change it |
| `mlock`, `munlock`, `mlockall`, `munlockall` | success | kept | no page of a process's memory is ever written out: locked is how it always is |
| `mprotect` | success, protects nothing | read and write: success (a shared file mapping made without write is then written back, `EACCES` if its descriptor is read-only); any other protection: `ENOTSUP` | memory is always readable and writable and never executable; revoking access or granting execution is not done |
| `mremap` | `ENOMEM` | kept | an explicit failure; realloc copies |
| `acct`, `mincore`, `socketpair` | `ENOSYS` | kept | explicit; `socketpair` is `sockets@0`'s when linked |
| `setpgid`, `getpgid`, `getsid`, `setsid` | pretend pid 42 leads its group and session; `setsid` returns 0 | each process is its own group and its own session: `getpgid`, `getpgrp` and `getsid` give the pid (the caller's for 0), `ESRCH` for none; `setpgid` of itself to itself succeeds, any other `EPERM`; `setsid` `EPERM` | true in Dolly, which has no groups (`docs/process-model.md`); `kill(0)` signals the caller and `kill(-pid)` that one process, `kill(-1)` stays `ENOTSUP`; `tcgetpgrp` and `tcsetpgrp` are `ENOTTY`: no terminal is a session's |

### Before the takeover (2026-10-23, evening)

- `getrusage`: fixed in `03717431` (core/npm-packages): the adapter answers with the rule
  `clock()` already follows, the time since the process started as user time; a check in
  `test/fixtures/process-lifecycle.c` fails on the old stub. Verified by the integrator
  (2026-10-23): `test/process-browser.mjs` passed in `work/x11fix` at `ba0f7f34`, the new
  seed, with that check, in Chromium (27.2 s) and Firefox (27.2 s).
- `times`: Emscripten's is a strong definition in `emscripten_libc_stubs.o` of `libstubs.a`,
  which a link pulls in for `getpwnam` and others, so the adapter's own collided ("duplicate
  symbol: times", make's link); `llvm-objcopy` cannot weaken a Wasm symbol. Reverted in
  `230716d6`. Taking the object over (`emar d` it from the staged `libstubs.a`, as
  `scripts/prepare-process-sysroot.sh` does for `raise.o` and the signal objects, and define
  what it held) is the way.
- The rest: `emscripten_syscall_stubs.c` and `emscripten_libc_stubs.c` hold more stubs that
  return success without doing the thing (`mprotect` "let's not and say we did", `mlock`,
  `madvise`, `setsid`, `getpriority`, `getresuid32`, `sync`, ...). Each needs a decision:
  honest result, explicit failure, or a recorded reason it is right for Dolly (`mprotect`
  succeeding is what OCaml's minor heap and other ports rely on).

## Done when

Every stub of both files that a Dolly program can reach is listed here with what
Dolly does and why; those that claim success falsely answer honestly or fail explicitly; a
test shows each change; the catalog's ports still pass.
