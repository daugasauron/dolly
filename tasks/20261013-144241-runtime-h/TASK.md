# Investigate: runtime.h beside libc

- STATUS: CLOSED
- PRIORITY: 245
- TAGS: core,process,abi,owner

Owner (2026-10-13), on
[the reflection](../20261013-142800-direction/reflection.md): "The audit is
too blunt. Some of the points are good but some are garbage. Both SLOP and
RUN are needed, see the history, this is hard earned wisdom. Create tasks to
investigate each of your points more in detail without deciding if they
should go or not".

This task investigates one of its points (section 1). It decides nothing.

Done when it holds, with the evidence and without a verdict:

- how the thing came to be: the commits and tasks that introduced it and
  changed it, quoted, and the reason each gives (`git log -S`, `git log
  --follow`, `tatr find`, the closed tasks);
- what it is for today and who uses it, counted from the code and the
  recipes, not from the reflection;
- each claim of the reflection below, checked: true, false or partly, with
  what was looked at;
- what would break, be lost or become harder if it changed, and what would
  get simpler, each shown on a real case;
- what could not be found out.

The owner decides what, if anything, follows.

## Closed (2026-10-14)

Owner (2026-10-14), on the tasks that waited for him: "I'm not gonna go
through 35 tasks, I'm sure some are not relevant anymore and some are
confirmed actual good fixes. If your investigation confirms they are fixes
that improve things and aligh with the main goal of the project go ahead. If
you're uncertain, give me a short description".

Nothing changes. libc is implemented on these functions, one body each, and
three kinds of spawn (with a deadline, with chosen descriptors, with the
foreground role) have no POSIX spelling. The investigation's "no caller
outside the adapter" for three names does not hold (searched 2026-10-14):
`test/fixtures/threads-quota.c` calls `dolly_waitpid`,
`test/fixtures/threads-pthread.c` `dolly_kill`, and
`src/process/env-driver.c` `dolly_spawn_env_timeout`.

## State (2026-10-14, 02:15): investigated, the owner's to read

[The investigation](investigation.md), by a Fable agent that read
`integrate/round-1013` and changed nothing (one report in two parts; the
other is [the twins](../20261013-144241-contract-twins/investigation.md)).
The integrator checked the nineteen declarations, `isatty`'s line in the
libc adapter and `foreground`'s spawn. It gives no verdict. What it found:

- `runtime.h` is older than the libc. In the first commit (`0d224977`,
  2026-08-29) it declared 29 functions and was the target's libc: the
  compiler rewrote libc names onto them (`-D exit=dolly_exit`,
  `-D isatty=dolly_isatty`). Private processes (`b95459ce`, 2026-09-05)
  brought musl and turned the direction round: libc's `isatty`, `wait4`,
  `kill`, `tcgetattr`, `posix_spawn`, `system` and `popen` are implemented
  by calling the `dolly_` functions. So "duplicates libc" is true of the
  names and false of the code: one body each, libc's on top.
- Two removals were made by the measure "who calls it": `26277ef5`
  (2026-09-30) and `f21825b1` (2026-10-01, "Drop process API that only
  tests or copies used"). The header has had today's nineteen since
  2026-10-06.
- `posix_spawn` came on 2026-10-01 (`9d35db82`, for GNU Make), after Slop
  and the commands were written on `dolly_spawn_mapped`. As implemented it
  always inherits every descriptor not marked close-on-exec, and has no
  deadline and no role. Three things have no POSIX spelling and are
  declared as C functions only here: a spawn with a deadline (`timeout`,
  status 124 "even inside a pure CPU loop"), a spawn that inherits none or
  only the standard three descriptors (libuv, CPython, Git, tmux, the
  engine), and a spawn with the foreground role (`/bin/foreground`, every
  `ENTRY`); beside them the timed terminal read, the interrupt poll and the
  published result.
- "The engine and Slop have no libc yet" is not the reason they call
  `dolly_` functions: libc is linked into every compile, theirs too. No
  record gives a reason.
- Callers, counted: Slop, the engine, `amy`, `foreground`,
  `run-program.h` (so `timeout`, `time`, `env`, `xargs`), six demo sources,
  the patches of Git and Samurai, and the kernel, which implements four of
  the names for itself. The reflection's list left five of these out, and
  the audit's "`dolly_spawn_foreground` only in Codex's launcher" is false.
  No caller outside the adapter: `dolly_waitpid`, `dolly_kill`,
  `dolly_spawn_env_timeout`.
- A change to the header rebuilds the seed and every image, but does not
  change the process layout's digest, which hashes `process.h` alone.
- The nearest word of the owner is on subprocesses as a module, "undecided,
  leaning toward a module" (2026-10-06,
  [runtime and process modules](../20261002-073000-runtime-process-modules/TASK.md)),
  put off "when single-program images exist in number". None on the header
  itself.
- Not found out: why Slop was not moved to `posix_spawn` after it existed;
  whether the ports could run on it with close-on-exec everywhere; the cost
  of `poll` and `read` in place of the timed terminal read.

## What the reflection claims and proposes (2026-10-13, unchecked)

- 19 functions. `dolly_isatty`, `dolly_kill`, `dolly_waitpid`,
  `dolly_terminal_mode_*` and `dolly_write_file` duplicate libc
  (`src/process/libc-adapter.c:51` is `isatty() { return dolly_isatty(); }`);
  six spawn wrappers of one call (`runtime-adapter.c:123-178`). Callers
  outside `src/process`: seven demo files, Slop, `dollyfile.c`, `amy.c`.
- Whether `dolly_terminal_publish_result` stays is
  [the test surface](../20261013-144241-test-surface/TASK.md)'s question.
- Seed.
