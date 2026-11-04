# The kernel knows each signal's disposition, and answers tcgetpgrp for the terminal

- STATUS: OPEN
- PRIORITY: 220
- TAGS: core,process,libc,signals,kernel

Two process-contract changes, decided 2026-11-04 (`tasks/20261102-133353-owner-decisions`): yes to
both, in one seed round (`process.h` changes, the seed compiler restamps, every image rebuilds).

**Dispositions.** They live in libc; the kernel learns only SIGALRM's (`ALARM_HANDLED`, op 71) and
guesses the rest (`tasks/20261101-074306-audit-kernel`, first proposal). Measured: `posix_spawn`
from a program that ignores any signal fails with ENOTSUP unless the attributes reset it
(`spawn_signals_supported`; probe `sigchld-ignore.c`: 0 of 80 spawned, Linux 80), so the common
`signal(SIGPIPE, SIG_IGN)` program cannot start one; an ignored SIGCHLD cannot reap, so a daemon
fills the 56-slot table with zombies; an ignored signal still arms the supervisor's 500 ms forced
termination until libc acknowledges it. One operation in place of op 71: libc reports the ignored
and handled masks on each change; the kernel reaps for an ignored SIGCHLD, skips the grace for an
ignored signal, and gives a spawned child the parent's ignored set and mask as EXEC already does
(`dolly_process_exec_state` in `dolly_process_spawn_request`, 56 to 72 bytes);
`spawn_signals_supported` goes. A rule decided in two places drifts (the audit's lesson); the kernel
owns signals, so it is the one decider. No catalog program is known to hit the refusal today
(git, CPython, libuv and Rust spawn around it), which is why it waited; a port that does not will
not be the first to learn of it.

**tcgetpgrp.** The libc adapter has none (`src/process/`, `include/`), so dte's one changed line
exists (`demos/tools/Dollyfile-dte:32`: `tcgetpgrp(fd) != -1` becomes `isatty(fd)`). The kernel
owns foreground policy and every process is its own group (`kill(-PID)` signals the child's own
group), so for the terminal descriptor the foreground process's pid is the true answer, ENOTTY for
anything else; `tcsetpgrp` stays ENOTSUP. dte then builds unchanged (prefer unchanged upstream).

Done when: a test that failed before for each: 80 of 80 spawns from a program with SIG_IGN on
SIGPIPE and on SIGCHLD; the children of a parent that ignores SIGCHLD are reaped (the table does
not fill); a program that ignores SIGHUP is not ended by the grace under hang-ups;
`tcgetpgrp(0)` in a foreground program equals its pid and is ENOTTY on a pipe; `Dollyfile-dte`
builds without its sed line; `test/process-browser.mjs`, `core`, `shell` and `pty` pass in
Chromium and Firefox on the round's images; `docs/process-model.md` says the kernel knows the
dispositions and what `tcgetpgrp` answers.

## State (2026-11-04, branch `core/process-signals`)

Done in this tree, waiting for the catalog round: `d20e6e491` (the contract), `f53451810`
(`ENOTTY` for pipes), `028bebeee` (dte unchanged), `186f22960` (pins), `735e6d84d` (Emacs's
`tcgetpgrp` hunk gone). Verified on `default`, `system`, `dte` and `gnu-emacs` rebuilt on the
new seed (image inputs `bc911e0f`): this tree's dist registers their 30 images only. Close
after the round's suites pass on its images.

## The change

- `process.h`: op 71 is `DOLLY_PROCESS_SIGNAL_DISPOSITIONS` (`dolly_process_signal_dispositions`,
  the ignored and the handled masks, 8 bytes, no response, never interrupted); `ALARM_HANDLED`
  is gone. `dolly_process_spawn_request` ends with `dolly_process_exec_state signals` (56 to 72
  bytes; pending must be zero). Terminal operation 7, `DOLLY_PROCESS_TERMINAL_FOREGROUND`.
- Kernel: an ignored signal is discarded when sent (`dolly_process_signal` returns 1, so the
  supervisor interrupts nothing and arms no grace); a parent that ignores SIGCHLD has each child
  reaped when its Worker retires; `take_alarm` reads the masks; SPAWN starts the child with the
  request's state, as EXEC does; exec commit drops pending signals the new program ignores.
- libc: `sigaction` and `SA_RESETHAND` report the masks under `action_lock` when they change
  (the call is never interrupted, so no handler runs inside the lock); `posix_spawn` computes
  the child's mask and ignored set from the caller and the attributes; `spawn_signals_supported`
  is gone. `runtime.h`'s spawns start children at defaults, as before. `TIOCGPGRP` asks the kernel.
- dte builds from upstream's files unchanged (the sed line, and `grep`/`sed` it needed, are gone).

## Decisions

- **`tcsetpgrp` keeps failing `ENOTTY`, not `ENOTSUP`.** The decision says it "stays"; what it
  is today is `ENOTTY` (the ioctl default). zsh takes `ENOTTY` from `tcsetpgrp` silently for no
  job control and warns for any other errno: `attachtty` (`Src/utils.c:4748-4760`, zsh 5.9.2)
  runs at every interactive line (`hist.c:1158`), so `ENOTSUP` would print "can't set tty pgrp"
  at the first prompt of every zsh. A no-op success for the caller's own group would be truer
  but turns zsh's MONITOR on, and with it job notices and `fg` warnings: a change of zsh's
  behaviour nobody asked for.
- **What `tcgetpgrp` answers.** The caller's pid when it is in the terminal's foreground: at the
  display, the foreground owner and what descends from it (or anyone while there is no owner);
  on a pseudo-terminal's slave every holder, as the slave's interrupt key reaches them all. Any
  other process gets the owner's pid, so a program that lost the terminal (an orphan) learns it
  is in the background. `ENOTTY` for a file that is not a terminal.
- **`runtime.h`'s spawns keep starting children at defaults.** Their callers reset anyway on
  Linux: CPython's `restore_signals` and libuv set SIG_DFL in the child; `system`/`popen` want
  SIGINT and SIGQUIT at their defaults. Only `posix_spawn` promises POSIX's inheritance.
- **The restamped seed compiler.** Its own libc is the old contract's. The one SPAWN it makes is
  `wasm-opt` for `--dolly-cast-emulation` (`src/compiler.cpp:966`), and an old 56-byte header is
  refused (`EINVAL`) by the new kernel. Nothing in `llvm-cc`'s closure (tablegen, cmake-build,
  python) uses cast emulation (zsh, glib and ghostty-gtk do), so the round builds and pins
  `llvm-cc` before those three.

## Before (2026-11-04 08:47, Chromium, `system` built at the old seed `e7867504`)

The new fixtures, run at the prompt on images of the old seed (`build/signals-evidence/before-chromium.log`):

- `process-dispositions`: the child of a parent with SIGPIPE ignored and SIGHUP blocked is
  refused (`-ENOTSUP`); with SIGPIPE and SIGCHLD ignored "0 of 80 spawned, then error 138"
  (`ENOTSUP`); after SIGCHLD back at default, a spawn is still refused for SIGPIPE.
- A child that ignores SIGHUP and spins 1.5 s without a system call, sent SIGHUP by `kill`:
  "signal 1 after 0.50 s", the supervisor's grace.
- `pty deaf`, the same child on a slave whose master closes: ended by SIGHUP. `pty program`:
  `tcgetpgrp(0)` on the slave is not the program's pid.
- `tcgetpgrp(0)` at the display's terminal: -1, `ENOTTY` (the lifecycle fixture asserted that).
- Found on the way: `isatty` and `tcgetattr` of a pipe failed with `ESPIPE`, not `ENOTTY`: the
  terminal request checked its descriptor with `descriptor_for`, which answers `ESPIPE` for a
  descriptor without a host file (`880804655` meant it as the bad-descriptor check only).

## After (2026-11-04 09:24-09:32, image inputs `bc911e0f`, runtime `3e539cb5`)

- The same probes, Chromium (`after-chromium.log`): process-dispositions passes (80 of 80
  spawned and each said it ran, `wait` then `ECHILD`, the table usable after); the SIGHUP child
  "exit 0 after 1.34 s"; `pty deaf` and `pty program` pass; `tcgetpgrp(0)` is the pid; `isatty`,
  `tcgetattr` and `tcgetpgrp` of a pipe are `ENOTTY`. The dispositions fixture passes on Linux
  too (under `script`).
- `test/process-browser.mjs`, `test/pty-browser.mjs`, `test/core-browser.mjs`,
  `test/shell-browser.mjs`, and also `test/threads-browser.mjs` and `test/terminal-browser.mjs`:
  pass in Chromium and Firefox.
- dte (`build/signals-evidence/dte-probe.mjs`, the amy tools steps for dte alone): `amy install
  dte`, its syntax dump, then at the terminal it shows its status line, saves and quits, and with
  standard input from `/dev/null` (it opens `/dev/tty` and asks `tcgetpgrp` of it) it starts and
  quits; Chromium and Firefox.
- Not attributed: the first `process-browser` run (Chromium, beside the pty run and two other
  agents' builds) failed lifecycle's limit check in both rounds (`spawned == -EAGAIN && count ==
  room`); a rerun with the values printed and a second full run in both browsers passed (52 of
  52). The check counts `/proc/processes`, which lists no exited process, so a record not yet
  collected when `room` is read makes the table full early; nothing in this change touches those
  records unless a parent ignores SIGCHLD, which nothing before the check does. Two more runs
  in both browsers, beside an image build, passed too: one failure in six Chromium runs.

## For the round

- Every image: `process.h`, `runtime.h` and the libc changed. Rerun
  `scripts/restamp-seed-compiler.mjs` after merging any other `process.h` change (the archive
  is the root `.cache/dolly-seed-compiler-a2c771b8…tar`, digest `36d9bdf9…`; neither other branch
  of today changes `process.h`), relink the Rust seed,
  and build and pin `llvm-cc` before zsh, glib and ghostty-gtk (cast emulation, above).
- `core/terminal-mode` changes the lines around both kernel edits in `process_dispatch` (its
  `read_deadline` reset on `-EINTR`, next to the new exemption) and the process record (its
  `read_deadline` after `mailbox`, near `alarm_handled`'s replacement): keep both.
- Emacs: `demos/emacs/test` passed in Chromium and Firefox on the rebuilt `gnu-emacs`, and the
  package in `default` (Chromium), without the hunk.

## Lessons

- An image build reads the tree's own headers as recipe `SOURCE`s when it pins: a build of the
  old seed started after `process.h` was edited pinned the edited header into old-seed images.
  Build the "before" images before touching any seed input, or measure "before" first.
- The restamp is sound only for the operations the seed compiler's own old libc makes; `grep
  posix_spawn src/compiler.cpp` before changing an operation's layout. Here it is one spawn
  (`wasm-opt`), outside `llvm-cc`'s closure, so the round's order carries it.
- An errno is behaviour: zsh takes `ENOTTY` from `tcsetpgrp` silently and prints a warning for
  any other, and dte and Emacs test `tcgetpgrp` against `getpgrp`. Read the programs that call a
  function before choosing what it fails with; the decision's "stays ENOTSUP" was a misremembered
  `ENOTTY`.
- The kernel's existing answer was enough to stop the grace: `dolly_process_signal` returning 1
  for "discarded" needed no new export, since the supervisor already stopped at a nonzero result.
- A check that counts `/proc/processes` against a limit sees no exited record; when it fails, print
  the counts at once, since a rerun may not show it again.
