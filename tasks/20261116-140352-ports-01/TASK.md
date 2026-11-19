# CPython's configure answers predate the libc: 16 os and signal functions Dolly has are missing from Python, and os.execvp exists but raises NameError

- STATUS: CLOSED
- PRIORITY: 230
- TAGS: audit,ports,python,0.1.8

## State (2026-11-17)

Fixed on branch `fix/python-config` (`4ca1c8a1c`), merged into `integrate/0.1.8` (`11369ad7c`);
no image rebuilt. `demos/python/config.site-dolly` now holds Dolly's answers alone: it no longer
sources upstream's Emscripten site file, and `prepare-cpython.sh`'s 37 environment answers and
four `sed`s on `pyconfig.h` are gone (two of the answers, `rewinddir` and `setrlimit`, configure
never asks). A line stands where Dolly's process libc answers otherwise than configure's probe of
the container's libc (each probe link-tested there; each answer read in `process/` and in the
symbols of round 1113's process sysroot); a function that never succeeds in Dolly is absent.
`cpython-Setup.local` builds `resource`.

Against 0.1.7's `pyconfig.h` every other answer is the same; 42 functions are now defined
(ctermid dup3 execv faccessat fdopendir getgroups getpgrp getpriority getresgid getresuid
getrusage getsid killpg lchown lockf nice pipe2 posix_fallocate posix_spawn posix_spawnp preadv
pthread_sigmask pwritev setegid seteuid setgid setpgid setpgrp setpriority setregid setresgid
setresuid setreuid setuid sigaction symlinkat times truncate utimensat wait3 wait4 waitid), and
five that only fail in Dolly no longer are (clock_settime, getloadavg, mremap, setsid,
sigaltstack). Measured, where it differs from "Smallest fix" below:

- `sigaltstack` (ENOSYS) had to go with `sigaction` on: faulthandler then takes an alternate
  stack, and `faulthandler.enable()`, which regrtest calls first, would raise.
- `prlimit` stays absent: Dolly's libc defines no `prlimit`, only `__syscall_prlimit64`.
- `getlogin_r` stays absent: posixmodule sizes its buffer by `UT_NAMESIZE` from `<utmp.h>`, which
  it includes only beside a pseudo-terminal function, and the build failed
  (`posixmodule.c:9635`). `os.getlogin` gives the same through `getlogin`.
- `sigwait`, `sigwaitinfo` and `sigtimedwait` stay, failing with ENOTSUP: `posixmodule.h`, which
  `signalmodule.c` includes before it defines `PYPTHREAD_SIGMASK`, gives `sigset_t` only beside
  one of them, and without them `pthread_sigmask` and `sigpending` were gone (measured).

`dist/static/python/cpython.tar.gz` is `14c1e5ba…`, the same from two preparations; the python
closure is pinned (`update-recipe-pins.mjs --sources` for `python`, then without): that source
pin and the artifact pins after it changed, 84 recipes.

Verified 2026-11-17 in sessions of round 1113's `system` with the packages the recipe builds
against, replaying `Dollyfile-python` from the new archive to its last check with stdin from
`/dev/null` (scripts and logs: `work/audit-1116-evidence/ports/fix-python/`, `rebuild.mjs`):

- The build and every check of the recipe pass: Chromium 87 to 207 s (load 27 to 34), Firefox
  105 s. So do its pip rows after it (Chromium) and the demo test's pip steps: `pip install
  requests` from its pinned wheels over the broker, and a venv whose pip installs `idna`.
- `functions.py`, each function used as a program would, passes in Chromium and Firefox:
  `os.execvp` of `echo`, `execve` with an environment, `execvp` of `cc` from a child that is
  waited for (as SpiderMonkey's `cargo-linker` ends), `posix_spawn`/`posix_spawnp` with `wait4`,
  `wait3`, `waitid`, `truncate`, `pipe2(O_CLOEXEC|O_NONBLOCK)`, `dup2(inheritable=False)`,
  `getsid`/`getpgrp`/`setpgid`/`setpgrp`/`killpg`, `getpriority`/`setpriority`/`nice`, `lockf`,
  `listdir(fd)` twice and `scandir(fd)`, `symlink`/`access`/`utime` with `dir_fd`, `lchown`, the
  `set*id` calls to 0, `getgroups`, `getresuid`, `posix_fallocate`, `preadv`/`pwritev`, `times`,
  `ctermid`, `pthread_sigmask` with `sigpending`, `alarm` and `setitimer` handlers with `sleep`
  resumed, SIGINT and SIGALRM as `KeyboardInterrupt`, `faulthandler.enable`,
  `resource.getrusage`/`getrlimit`/`setrlimit`, `subprocess`, `socketpair`; fork, link, mkfifo,
  pthread_kill, prlimit and getloadavg absent.
- The python demo test's checks that need no PyPI files pass on the rebuilt interpreter, in
  Chromium and Firefox: `python-process.py`, `python-shutil.py`, `python-sockets.py`, a venv,
  the REPL, and Ctrl+C ending `signal.pause()` with status 130 and `KeyboardInterrupt`.
- Python's own tests (`python -m test -v`: test_os, test_posix, test_signal, test_resource,
  test_wait3, test_wait4, test_faulthandler, test_mmap, test_fcntl, test_threadsignals), against
  the packaged interpreter's run of the same files in a Chromium session (Firefox gives the
  rebuilt interpreter's results test for test): no test that passed fails. 118 more pass: 102
  that were skipped (41 in test_os, among them exec, fwalk, the `set*id` calls and `scandir(fd)`;
  57 in test_posix, 39 of them `posix_spawn`/`posix_spawnp`; 4 in test_signal, `pthread_sigmask`
  and `sigpending`), 8 of test_resource, and 8 that raised (getloadavg's, five mmap tests that now
  get CPython's no-`mremap` answer, `TestInvalidFD.test_ftruncate`, `test_enums`); one more mmap
  test skips instead of raising. The newly run tests that fail meet a Dolly limit, not a
  configure answer: the sigwait family (6, above);
  `posix_spawn` with `setpgroup` or `setsid` (4, ENOTSUP, `docs/process-model.md`) and with
  `setsigdef` (2, below); `setpriority` to another nice (EPERM, one priority);
  `resource.setrlimit` to another limit (2, EPERM as `ValueError`); `utime` without following
  links, whose stored time comes back 1 ns short as in the six `utime` tests that failed already;
  `test_pipe2_c_limits`, which needs `_testcapi`. `test_interprocess_signal` waits for ever, with
  the packaged interpreter too once its test package is in place (both stopped by a 120 to 240 s
  timeout), so it is run apart.

Found on the way, not changed (the seed's): a SIGUSR1 or SIGUSR2 at its default action fails
ENOTSUP instead of ending the process, and one sent to another process never arrives
(`DOLLY_PROCESS_SIGNAL_MASK` names ten signals): `test_setsigdef`, `test_interprocess_signal`.

Left:

- The round's rebuild must confirm: staging gives the `cpython.tar.gz` the recipe pins (configure
  in the pinned container, which asks the host's Python 3.14 for its version only); `python`
  builds with every check of its recipe, its frozen modules made by its own freezer; the
  python demo test (`demos/python/test/python-browser.mjs`) passes in Chromium and Firefox, its
  Ctrl+C on `signal.pause()` now through `sigaction`; `functions.py` passes on the published
  package; and the images that install python as a build tool rebuild and pass their tests:
  the LLVM chain, where `llvm-cc` must give the pinned seed compiler (`c98f9ab6…`) again, then
  Rust (`rust-llvm` and what its `rustc` builds), Mojo, Zig, Meson, SCons and Godot, X11,
  `spirv-wgsl`, SpiderMonkey and 0 A.D., and the Python data packages that pip builds.
- On `ws/ports` (2026-11-17), `spidermonkey.patch` no longer replaces `cargo-linker`'s
  `os.execvp` of the linker with `subprocess.call` (its shebang hunk stays): the round's
  `spidermonkey` build (0 A.D.'s chain) must link through it. `os.execvp` of `cc` from Python, as
  that script ends, works (above). The host freezing step went too
  (`tasks/20261116-143518-ports-08`): the archive no longer depends on the host Python's patch
  version; it is `4d96d70f…`, the same when prepared again from nothing, and `python` built from
  it in `ws/ports` passes every check of its recipe (`work/audit-1116-evidence/ports/fix-ports/`,
  `build-3.log`). So of the first bullet the round's rebuild confirms what installs python as a
  build tool and `functions.py` on the published package.

## Closed (2026-11-19)

Round 018k on `integrate/0.1.8` `8d666a4e4` (`work/integrate-018/build/round/`): its images stage
built `python` from the pinned archive with every check of its recipe, and every image that
installs it as a build tool (the LLVM chain, Rust, Mojo, Zig, Meson, SCons, Godot, X11,
`spirv-wgsl`, SpiderMonkey, 0 A.D., the Python data packages); its compiler stage found the seed
compiler `llvm-cc` gives unchanged. In its suites the python demo test passed in Chromium
(72.7 s, on `default` 236.7 s) and Firefox (72.0 s, 265.7 s), and `python-data` with `openblas`
and `numpy` in both (`suites.log`). `functions.py` on that round's `python` package, in a session
of `system` with `curl` and `python` installed, prints `functions: all passed` in Chromium and
Firefox: `os.execvp`, `execve`, `os.truncate`, `os.pipe2`, `os.posix_spawn`, `os.wait4`,
`signal.pthread_sigmask` and `resource.getrusage` among them (`functions-browser.mjs`,
`functions-chromium.log`, `functions-firefox.log` in `work/evidence-2026-11-19/rc-ports/`).
`prepare-cpython.sh` has no `sed` on `pyconfig.h`.

## What

`demos/python/prepare-cpython.sh` configures CPython in the Emscripten container with
Emscripten's site file (`demos/python/config.site-dolly:3` sources upstream's
`Platforms/emscripten/config.site-wasm32-emscripten`) and its own `ac_cv_func_*=no` list
(`prepare-cpython.sh:81-95`), every line of which dates from 2026-09-01 (`2c9a3fcb9`). Since then
Dolly's libc has gained the functions, so configure's answers now say "absent" for operations
Dolly implements. Four `sed` blocks on the generated `pyconfig.h` (`prepare-cpython.sh:155-180`:
login_tty, alarm, setitimer, sys/un.h, socketpair, shutdown, pthread_getcpuclockid, pthread_kill)
and three on its `Makefile` (`:143-152`, `:186-210`: the compiler, the extension ABI names,
Emscripten's `-s` settings) correct Emscripten's answers one at a time.

Measured 2026-11-16 in Chromium on `work/round1113`'s dist (system plus the `python` package,
`work/audit-1116-evidence/ports/probe.mjs` with `python-probe.json` and `python-probe-2.json`,
logs `python-probe.log`, `python-probe-2.log` there):

```
os missing: ['execv', 'execve', 'posix_spawn', 'truncate', 'pipe2', 'dup3', 'wait3', 'wait4',
 'waitid', 'getsid', 'getpgrp', 'setpgid', 'killpg', 'openpty', 'ttyname', 'fdopendir',
 'getpriority', 'lockf', 'fork']
signal missing: ['pthread_sigmask']
also missing: posix_spawnp, getrusage (no `resource` module at all), preadv, pwritev,
 posix_fallocate, nice, setpriority
os.execvp('echo', ['echo', 'hi'])  ->  NameError: name 'execv' is not defined
```

(`dup3` and `fdopendir` in the probe's list are libc names, not `os` functions; they stand for
what `os.dup2` and `os.listdir(fd)` would use.) `os.execl`, `execlp`, `execvp` and `execvpe` are defined (they are Python code in `os.py`) and
fail with `NameError` when called: a program that tests `hasattr(os, "execvp")` is told exec
works and then crashes.

Of the missing names, Dolly's libc implements, with the line that does it:

| Python | libc |
| --- | --- |
| `execv`, `execve` (and so `execl`...`execvpe`) | `process/runtime-adapter.c:600` (exec, operation 61, since `ba5f2568e`, 2026-10-23) |
| `posix_spawn`, `posix_spawnp` | Dolly's own (`process/libc-stubs.c:4`) |
| `truncate` | `process/libc-adapter.c:707` |
| `pipe2` | `process/libc-adapter.c:1694` |
| `os.dup2(..., inheritable=False)` uses `dup3` | `process/libc-adapter.c:1350` |
| `wait3`, `wait4` | `process/libc-adapter.c:97` |
| `waitid` | `process/libc-stubs.c:34` |
| `getsid`, `getpgrp`, `setpgid`, `killpg` | `process/libc-adapter.c:103-130` (each process its own group, as documented) |
| `os.listdir(fd)` and `os.scandir(fd)` use `fdopendir` | musl over `getdents64`, `process/libc-adapter.c:1738` |
| `getpriority` | `process/libc-adapter.c:873` |
| `lockf` | record locks, `process/libc-adapter.c:1635` |
| `signal.pthread_sigmask`, `sigaction` | `process/signal.c:101,168` |

Correctly absent: `fork`, `link`, `mkfifo`, `ttyname` (needs `/proc/self/fd`), and `openpty`
(only through `-ldolly-pty` and `pty@0`, which the `python` package does not link).

AGENTS.md, porting rules: "Report unsupported capabilities accurately so upstream selects its
fallbacks". Here supported capabilities are reported absent, so upstream drops them: Python
programs lose exec, `os.truncate`, `os.pipe2`, `os.posix_spawn`, `resource`, and get a
`signal()`-based signal module instead of `sigaction`.

Confirmed in a session the same night (Chromium, round 1117's `system` with the packages the
recipe builds against): replaying `Dollyfile-python`'s rows from its `cpython.tar.gz` to its
`make` row, with only the prepared `pyconfig.h`'s 18 `/* #undef HAVE_X */` turned into
`#define HAVE_X 1` (EXECV, TRUNCATE, PIPE2, POSIX_SPAWN, POSIX_SPAWNP, WAIT3, WAIT4, WAITID,
GETSID, SETPGID, GETPGRP, KILLPG, GETPRIORITY, LOCKF, PTHREAD_SIGMASK, SIGACTION, DUP3,
FDOPENDIR), builds `python` in 130 s, and that interpreter has every name above (`os missing:
[]`, `signal missing: []`); `os.execvp('echo', ['echo', 'exec from python works'])` prints it,
`os.truncate` leaves `'ab'`, `os.pipe2(os.O_CLOEXEC)` gives two descriptors,
`os.posix_spawn('/bin/echo', ...)` runs the child, `signal.pthread_sigmask` returns the old
mask, and `subprocess.run` still works. `os.wait4` then fails only for want of the `resource`
module, which it imports. Script and log: `work/audit-1116-evidence/ports/python-rebuild.mjs`
(it writes `python-rebuild.slop` from the recipe), `python-rebuild.log`.

A consequence elsewhere: `demos/zero-ad/toolchain/spidermonkey.patch:251` replaces
SpiderMonkey's `os.execvp` of the linker with `subprocess.call` ("Dolly has no exec"), which is
needed only because this Python has no `execv`.

## Smallest fix

In `prepare-cpython.sh` delete the stale `ac_cv_func_*=no` entries (`getpgrp`, `killpg`,
`wait3`, `wait4`, `waitid`, `getsid`, `setpgid`, `dup3`, `lockf`, `truncate`, `fdopendir`,
`getpriority`, `execv`, `pthread_sigmask`; and `setuid`, `setreuid`, `setgid`, `setregid`, which
since `220b6bab1` (2026-10-15) set the ids a process has, `process/libc-adapter.c:834`) and
state the Emscripten site file's wrong ones as `yes` in `config.site-dolly` (`posix_spawn`, `posix_spawnp`, `pipe2`, `sigaction`, `prlimit`,
`getrusage`, `setpriority`, `alarm`, `setitimer`, `socketpair`, `shutdown`, `sys/un.h`), which
also removes the `sed` blocks that undo the site file. Better still, stop sourcing Emscripten's
site file and give Dolly's answers in `config.site-dolly` alone. Build the `resource` module
too (configure marks it n/a for Emscripten), which `os.wait3` and `os.wait4` import. Then drop
the `subprocess.call` hunk of `spidermonkey.patch`. The same script's host freezing step can go in
the same change (`tasks/20261116-143518-ports-08`).

Cost: `python` is installed by `llvm-tablegen`, `llvm22-tablegen`, `rust-llvm`, `mojo-llvm`,
`meson`, `scons`, `x11-build`, `spirv-wgsl`, `spidermonkey`, `zero-ad-data` and the Python data
packages, so the change rebuilds the seed compiler's chain and the Rust, Mojo, Zig, Godot and
X11 chains: do it in a round that rebuilds them for another reason.

## Done when

- In the `python` package, `os.execvp('echo', ['echo', 'hi'])` prints `hi`, `os.truncate`,
  `os.pipe2`, `os.posix_spawn`, `os.wait4`, `signal.pthread_sigmask` and `resource.getrusage`
  work, and the python demo's browser test passes in Chromium and Firefox.
- `prepare-cpython.sh` has no `sed` on `pyconfig.h` for a function the libc provides.
