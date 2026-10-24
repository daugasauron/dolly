# exec: replace a process's program in the process contract

- STATUS: CLOSED
- PRIORITY: 260
- TAGS: core,process,abi,slop,libc,0.1.4

## Closed (2026-10-23, `core/process-exec`, merged into the integration branch)

Every test under "Tests that decide it" passes in Chromium and Firefox ("Verification" below).
The seed the contract needs is [exec-seed](../20261023-121443-exec-seed/TASK.md)'s, in the
reconciliation round.

## State (2026-10-23, night): built and verified on `core/process-exec`

Operation 61 is `DOLLY_PROCESS_EXEC`; libc's `execve` family, Slop's `exec`, `env` and
`command` (which now exec the program they name) and `posix_spawn_file_actions_addclose`
are over it, and `addopen` beside it. Every test under "Tests that decide it" is written
and passes; see "Verification". With them, items 1 and 3 of
`tasks/20260930-100000-audit-53` (below, "The start of a cached program; Ninja's jobs").
Commits: `ba5f2568`, `84939901`, `6028054b`, `1ab8bf5f`, `84bb1d10`. What the seed still needs in the reconciliation round, the restamp after
the merges and `llvm-cc` built under the new contract, is
`tasks/20261023-121443-exec-seed`; the Rust seed is relinked as for any `process.h` change.

### Decisions, each with its reason

- **Two phases, the kernel's and the supervisor's.** EXEC reads the program into
  `staged` beside the running one (path, arguments, environment, `#!` resolved, image),
  so ENOENT, ENOEXEC and E2BIG fail the call at once. The supervisor then compiles and
  admits it (stamp, imports, host modules: `#admit`, the same check as a launch) while
  the old Worker waits in the call; a refusal drops the staged program
  (`dolly_process_exec_refused`) and answers ENOEXEC after one line on the process's
  descriptor 2, as a refused spawn's line. Only then `dolly_process_exec_commit`:
  the point of no return. The loader is the supervisor's, so admission cannot be the
  kernel's; two edges were needed.
- **The record keeps** pid, parent, children, cwd, `fcntl` locks, the alarm,
  kernel-pending signals, spawn flags (foreground and interactive roles: they are the
  process's, not the program's), the spawn deadline, and descriptors without
  `FD_CLOEXEC`. **It drops** CLOEXEC descriptors, what every host module holds for the
  pid (`release_modules(pid, 0)`: threads table, GPU, audio, input and display leases,
  staged HTTP bodies, downloads), and `handling_signal`. Memory, mappings, DSOs,
  `atexit` and threads go with the Workers. `MAP_SHARED` is not written back, as at
  exit today.
- **Signal state crosses in the request.** Mask, ignored set and the signals libc has
  taken but not delivered live in the old program's memory, so `execve` sends them
  (`dolly_process_exec_state`, a bit per signal) and the new program's crt1 reads them
  back before its first other call: EXEC with an empty request, which the kernel never
  interrupts. Handled signals start at their default action. The alarm's handled flag
  follows the ignored set. Not INFO: an old binary asks INFO with an 8-byte capacity,
  and the restamped seed compiler (below) is such a binary.
- **A signal during the preparation interrupts EXEC** (the old program's handler
  runs, libc calls EXEC again, the compile is cached); a resize waits. After the commit
  and before the new Worker starts the process is `starting`, and a signal ends it, as
  a spawned process before entry. A terminating signal still pending at the commit
  gets its 500 ms from the new program's start, not from the commit.
- **The Worker swap reuses the start and retire edges**: `#disposeWorker`, then the
  launch path's `#start` (memory, gate, thread attach, Worker). A large interactive
  program gets the 500 ms of reclamation it gets at exit before the new memory is made.
  No new browser authority: two kernel exports in `abi/dolly-supervisor-0.wat`.
- **Exec from a thread** ends the other threads; the new program is single- or
  multi-threaded by its own stamp.
- **Slop:** `exec PROGRAM` replaces the shell; a stage's `exec PROGRAM` is the stage's
  program (as `&` did); in a subshell or substitution it runs the program and ends the
  subshell with its status without the subshell's EXIT trap; a failed exec ends a
  script (127 missing, 126 otherwise), as POSIX and Bash do, and not the prompt.
- **`addclose`** is a mapping whose source is `DOLLY_PROCESS_FD_MAPPING_CLOSED`: the
  child does not inherit the target. A `dup2` from a descriptor an earlier action
  closed is EBADF, as the child's dup2 would be.
- **`fork` and `vfork`** stay ENOSYS, now Dolly's own definitions.
- **`env` and `command`** exec the program they name, their last act, instead of
  spawning it and passing its status on: the program keeps the process and its signals.
- **Known property:** every delivered signal restarts a preparation, so a stream of
  signals faster than the image's SHA-256 (the compile itself is cached) delays the exec
  as long as it lasts. Inside a handler, where the kernel hands over no second signal,
  libc calls EXEC again rather than failing with `EINTR`.
- **The seed compiler** carries the old contract's digest in its stamp and in the copy
  it writes into what it links; build.sh refuses it. `scripts/restamp-seed-compiler.mjs`
  swaps the digest in those two places (exactly two occurrences, checked) and pins the
  archive; its own libc stays the old one, sound because the contract change only adds.
  The reconciliation must run it again after merging any other `process.h` change, and
  should then build `llvm-cc` under the new contract and pin that
  (`demos/llvm/pin-seed-compiler.mjs`), so no restamped compiler is left.

### Cost

`process.h` changed: digest `8002d2ac9e15e7d366e3eae77fdb1c61ac7650239792dc0c1ca64b7a1c3f4730`
(was `154f4aec…`). Every image rebuilds, the seed compiler is restamped (above), the Rust
seed must be relinked (`demos/rust/build-rust-toolchain.sh`), and `llvm-cc` should be
rebuilt and pinned once in the round.

The restamped archive exists only in this tree
(`work/process/.cache/dolly-seed-compiler-14571deb664109ea99883a76e721b50555388e9046818d72c9519fc879be7ec2.tar`,
pinned with the v0.1.4 release URL that does not hold it yet). After merging, either copy it
into the integration tree's `.cache`, or pin the 0.1.3 seed again and run the tool once all
`process.h` changes are in: it rewrites whichever digest the pinned compiler carries.

For the merge: the kernel's record holds what it runs in `program` (`process->program.path`,
`.arguments`, `.environment`, `.image`), so another branch's lines on those fields take the
rename; the 32-process cap (`tasks/20260930-100000-audit-53`) is not touched.

### Verification

- Costs, measured (`system`, 2026-10-23, a probe kept under `build/process-evidence/probe/`):
  the start-state call every program now makes takes 6.4 µs in Chromium and 10.3 µs in
  Firefox (20,000 calls); an exec of a small program, compiled once and cached, takes
  3.3 ms and 5.7 to 6.0 ms, the same as a spawn and wait of it (3.0 to 3.3 ms and 5.7 to
  5.8 ms), with one Worker and one memory instead of two.

- `process-exec.c` compiled natively passes on Linux (6.8) with `/dev/null` for
  `/proc/processes`, but for two checks of Dolly's own: Linux refuses a file without
  execute bits with `EACCES`, where Dolly has no permission bits and says `ENOEXEC`, and it
  runs an exec with an empty `argv`, which Dolly refuses with `EINVAL` as spawn does. So the
  record kept and dropped is Linux's, signal state and alarm included.
- Native, against Bash under ASan: `node --test test/slop.test.mjs`, 197 of 197, the
  nine `execCases` among them (libtool's wrapper, `config.status`'s `exec "$@"`,
  `install-sh`'s subshell, a stage, a substitution, a failed exec, a reset trap).
- Chromium and Firefox, `system` and `default` on the new seed (2026-10-23, 20:33):
  `test/process-browser.mjs` (process 35.2 s and 34.6 s: `process-exec.c`'s check
  mode, the pipe, the deadline, Ctrl+C; `process-lifecycle.c`; `process-descriptors.c`),
  `test/slop-browser.mjs` (15.7 s, 21.0 s), `test/threads-browser.mjs` (exec from a
  second thread: 14.6 s, 14.8 s).
- The same day, both browsers: `shell`, `pty`, `ending`, `core`, `cpp`, `terminal`,
  `custom-session`, `host-modules`, `shell-env`, `man`, `boundary`, `upload`, `display` and `network`
  (`test/*-browser.mjs`) pass. `default`, `nena` and `pager` need package images outside
  this tree's narrowed index (python, libdolly-audio, less). `image` fails at its cache
  check: with `system-tools`'s bytes changed it expects the rebuild of `system` to be
  requested and gets `session-recover`, which `system` installs and which is built from
  `system-tools` too; that code (`src/image-build.mjs`) is not this branch's, and it is not
  attributed.
- With `addopen`, upstream Samurai and file versions (below), the same day at 21:45, both
  browsers: `process` (33.0 s, 33.0 s), `slop`, `threads`, `dso`, `sockets`, `shell`, `pty`
  and `ending` pass; `npm run test:source` 445 of 445.

## The start of a cached program; Ninja's jobs (audit-53, items 1 and 3)

- **A start reads no executable whose module is cached.** The kernel opens the program's
  file and reads only its head (a Wasm header or a `#!` line); the supervisor asks the
  file's version (`dolly_process_image_version`) and runs the module it compiled from that
  version, and only another version is read (`dolly_process_image_read`), copied and
  hashed as before. The version is the block backend's: one counter for all files, a new
  number for each file made and for each write or size change of it, so a rewritten,
  replaced or truncated executable is read again and a hard link or rename keeps it
  (`src/file-blocks.cpp`). A file of another backend has version 0 and is always read.
  Two kernel exports in `abi/dolly-supervisor-0.wat`, no change to `process.h`; checked by
  `process-browser.mjs` (a program rewritten in place runs its new bytes). exec takes
  the same path.
- **Ninja runs its jobs at once.** `posix_spawn_file_actions_addopen` opens the file in
  the parent, from the directory the actions name, and maps it to the child's descriptor;
  with `addclose` that is all upstream Samurai's `jobstart` needs, so
  `config/samurai-dolly.patch` is gone (Samurai builds unchanged); unless told `-j N` it runs
  two jobs, since libc counts one processor without `-pthread`. `process-browser.mjs` checks two rules that
  each wait for the other's file. Only `addfchdir_np` is still `ENOTSUP`.
- **Measured** (`system`, 2026-10-23 21:49, load 6, `build/process-evidence/probe/start-cost.mjs`;
  "hashing" is this branch with the version lookup turned off, which is how every start
  worked before): 40 runs of `cc --version` under Make, Chromium -j1 4.30 and 4.34 s
  hashing, 0.73 to 0.86 s with versions; -j8 3.85 to 4.02 s, 0.24 to 0.29 s. Firefox -j1
  4.68 and 4.82 s, 1.12 to 1.48 s; -j8 3.98 and 4.39 s, 0.27 to 0.32 s. Ninja building
  eight small C files: serial and hashing (the patched Samurai) 0.99 to 1.30 s in Chromium,
  1.14 and 1.15 s in Firefox; at `-j4` with versions 0.13 to 0.17 s and 0.14 to 0.15 s.

## The request

Owner (2026-10-06, 21:45): "I think real execve sounds better?", then: "keep
the real execve path but its very low priority for now." Asked while
Slop was being run against real `configure` scripts: libtool's generated
wrappers use `exec PROGRAM` 18 times, and Dolly has no exec
(`docs/process-model.md`: "There is no `fork` or `exec`"). The alternative, a
shell-level imitation (run the program, forward signals, exit with its
status), was considered and not taken: the program would have another pid and
every wrapper would keep a Slop Worker and its memory alive under the program,
in a browser where memory is the scarce thing.

## What it is

One new operation of the process contract (number 61 is reserved for it; 58
and 60 are file modes, 59 locks): path, arguments, environment. On success it
does not return: the kernel keeps the process record and the supervisor swaps
the Worker and its private memory for a fresh one running the new program.
libc's `execve` family calls it. There is still no `fork`.

## What had to be designed (answered under "Decisions")

- What the record keeps: pid, parent and children (so the new program can wait
  for them), descriptors without close-on-exec, cwd, the file-mode mask,
  `fcntl` locks, pending signals and the mask, ignored dispositions, alarms,
  the foreground and interactive roles, a timed spawn's deadline.
- What it drops: handlers (back to default), threads (`threads@0` Workers of
  the old program), mappings, DSOs, `atexit`.
- The point of no return: a missing, non-executable or unadmitted program
  (the image's `REQUIRES HOST` set) must fail with the old program still
  running, so the load and the admission check come before the old Worker
  goes.
- The Worker swap: retirement has no completion event and today waits up to
  500 ms for reclamation; two memories exist for a moment. Whether the swap
  needs anything new from the supervisor contract
  (`abi/dolly-supervisor-0.wat`) or reuses the start and retire edges. No new
  browser authority is expected; confirm it.
- Slop's `exec PROGRAM` and `exec` with only redirections.
- A subshell is not a process in Slop, so `( ... && exec prog )` (it is in
  `install-sh`) cannot be served by replacing the process: inside a subshell
  `exec PROGRAM` has to run the program and end the subshell with its status.
  The uses seen in real scripts are listed in
  `20261006-121403-configure-survey` (branch `core/concurrent-pipelines`).

## Tests that decide it

The pid is unchanged and the parent's `waitpid` gets the new program's
status; descriptors survive or close by their flag; a pending signal is
delivered to the new program and a handler is not; a missing program returns
`ENOENT` and the caller continues; Ctrl+C reaches the new program; exec in a
pipeline, from a thread, and under a timed spawn; libtool's wrapper cases
against Bash.

Where each is: `test/fixtures/process-exec.c` (pid and `waitpid`, descriptors by flag,
mask, ignored and pending signals, handlers reset, the alarm kept, ENOENT, ENOEXEC and a
refused executable with the caller going on, `execle`'s environment, a malformed packet,
the pipe, the deadline, Ctrl+C), run by `test/process-browser.mjs`; exec from a second
thread in `test/threads-browser.mjs`; the shell's cases in `execCases` of
`test/fixtures/slop-cases.mjs`, run against Bash natively and in Dolly.

## Related

`20261006-121403-configure-survey` (the uses), `20261005-222449-spawn-users`,
`20261005-133401-kernel-boundary`.
