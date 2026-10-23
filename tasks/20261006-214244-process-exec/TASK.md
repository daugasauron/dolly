# exec: replace a process's program in the process contract

- STATUS: IN PROGRESS
- PRIORITY: 260
- TAGS: core,process,abi,slop,design,0.1.4

## State (2026-10-23, night): built on `core/process-exec`

Operation 61 is `DOLLY_PROCESS_EXEC`; libc's `execve` family, Slop's `exec` and
`posix_spawn_file_actions_addclose` are over it. Natively the Slop cases pass against
Bash under ASan (`test/slop.test.mjs`, 197 of 197). The browser tests below are written;
see "Verification" for what has run.

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

## State (2026-10-23): build it now

Owner (2026-10-23), after Opus in Pi met Slop's refusal of a script's `exec PROGRAM`: "I want
exec to be done properly". The real `execve` path described below, in the process contract,
for v0.1.4, whose catalog round rebuilds every image anyway. The shell-level imitation stays
rejected (the reasons are under "The request"). Also in this contract change:
`posix_spawn_file_actions_addclose`, which the spawn packet cannot carry today (the OCaml
port met it, `tasks/20261023-210000-ocaml/TASK.md`).

## State (2026-10-13)

Not started, by the owner's word ("very low priority for now"), and still wanted: `cargo run`
builds and then fails because Cargo `exec`s the program
(`tasks/20261009-110500-rust-followups`), and libtool's wrappers use `exec PROGRAM`
(`tasks/20261006-121403-configure-survey`, closed). tmux does not wait for it: its jobs start
by spawn (`tasks/20261012-130814-tmux`).

Verified on main `4ed1d9ef`: `docs/process-model.md` still says there is no `fork` or `exec`,
and operation 61 is free in `include/dolly/process.h` (59 is locks; 58 and 60 are taken only on
`core/file-modes-2`, `tasks/20261006-120641-umask`).

It changes the process contract, so it goes in a round that changes the contract anyway, file
modes for one. Nothing below is decided or built.

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

## What must be designed before any code

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

## Cost

The contract's hash changes, so every image rebuilds and the Rust seed is
relinked: it belongs in the same round as the other contract changes
(`core/file-locks`, `core/input-module`, `core/dso-module`, file modes), not
in a round of its own. The code is in the retirement path, where two signal
races were found on 2026-10-05 and 2026-10-06.

## Related

`20261006-121403-configure-survey` (the uses), `20261005-222449-spawn-users`,
`20261005-133401-kernel-boundary`.
