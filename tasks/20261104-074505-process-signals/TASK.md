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
