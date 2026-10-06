# Slop pipeline limits stall common agent commands

- STATUS: OPEN
- PRIORITY: 290
- TAGS: slop,core,compatibility,agent

Documented design limits: pipelines are serial so `yes | head` never finishes
(`docs/slop.md:238-246`); a compound command cannot be a pipeline stage so `... | while read`
fails (`docs/slop.md:201-205`). Both are common in agent-written shell.

## Evidence

Established: CONFIRMED BY READING. Documented behavior at main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Either bounded concurrent pipelines (kernel pipes already exist) or an explicit, immediate error
for the unsupported shapes; never an indefinite stall.

## Done when

- Browser check: `yes | head -n1` completes; `printf 'a\nb\n' | while read x; do echo $x; done`
  works or fails immediately with a clear message.

## Recheck (2026-10-01, `rebuild-batch` default image, Chrome)

- `printf 'a\nb\n' | while read x; do echo "<$x>"; done` works: every stage,
  compound commands included, is a subshell now.
- `seq 1 999999999 | head -n1` still stalls (killed by `timeout 20`, 124):
  stages run one after another through spool files, so `head` cannot stop an
  unbounded producer. `yes` is not installed (sbase's is not in the tool list).
- Concurrency now exists: Make `-j` spawns concurrent children over kernel
  pipes with `posix_spawn` and `waitpid(-1)` (branch `next`). Running external
  pipeline stages concurrently over pipes, with in-process stages (builtins,
  functions, compound commands) still serial, would remove the stall for the
  common agent shapes. `docs/slop.md` records serial pipelines as intentional,
  so this is an owner decision.

## Decision (2026-10-01, delegated)

Run external pipeline stages concurrently over kernel pipes; builtins,
functions and compound stages stay in-process and serial. Update
`docs/slop.md` when implemented.

## Review (2026-10-05, `20261005-131642-big-picture`)

Raised from 180: this is the largest difference an agent meets between Slop
and a conventional shell, and the decision above is already made.

- The kernel is concurrent (Make `-jN`, `posix_spawn` without waiting, 64 KiB
  pipes, `poll`, `waitpid(-1)`); only Slop is serial. The agent's audit
  (`~/Downloads/AUDIT-sandbox-painpoints.md` §3, §4) read the two as a
  contradiction: `xargs -P 8` answers "Dolly executes serially"
  (`src/commands/xargs.c:179`) while `make -j8` ran eight jobs at once, and it
  wrote a 1,305-file fetcher as a Makefile to get parallelism.
- With concurrent external stages, `xargs -P N`, `cmd &` and `wait` are the
  same mechanism (spawn without waiting, wait for any): include them here
  rather than as separate items of `20261005-131650-userspace-gaps`.
- `docs/architecture.md` ("Slop is serial; builds run in parallel") and
  `AGENTS.md` ("Prefer simple serial semantics over multiprocessing") describe
  the shell, not the kernel any more. The owner should reword the `AGENTS.md`
  sentence when this lands; `docs/slop.md` and `docs/architecture.md` change
  with the code.

Added to done-when: `seq 1 999999999 | head -n1` returns at once;
`make 2>&1 | tee log` shows output while Make runs; `xargs -P 4` runs four
processes; the spool-file path remains only for in-process stages.

## Notes from the userspace batch (2026-10-05, `fix/audit-core`)

`xargs -P N` is done on the kernel's own mechanism (spawn without waiting,
`waitpid(-1)`; `src/commands/xargs.c`). `wait` exists and returns at once, and
`cmd &` is still an error: both wait for this task. Concurrent stages were
not landed in that seed batch because they change every pipeline in every
recipe and the catalog could not be rebuilt to check it. Found while reading
for it:

- The kernel must raise `SIGPIPE`. `docs/process-model.md` says a write with no
  reader returns `EPIPE` "without raising `SIGPIPE`", and sbase's `seq` ignores
  write errors, so `seq 1 999999999 | head -n1` would still run to the end,
  now printing errors. Marking `SIGPIPE` pending in `fd_write_packet` when
  `pipe->readers == 0` ends the producer at its next call.
- With `set -o pipefail`, which recipes use, a consumer that stops early
  (`| head -n1`, `| grep -q`) then fails the pipeline with 141, as in Bash.
  Serial Slop never did this; recipes need a pass for it.
- Choose the pipe by the producer: a stage that is an external simple command
  (a literal word that is no function or builtin and resolves on `PATH`)
  writes to a kernel pipe and is not waited for; any other stage runs in the
  shell and writes to a spool file, because 64 KiB of pipe would block it with
  no reader running. The consumer may be either kind.
- Pipe ends must be close-on-exec in the shell (`high_descriptor` already
  does this for spools) and reach a stage only as its mapped descriptor 0 or
  1, or a stage keeps its own pipe open and the reader never sees EOF.

## Decision (2026-10-06): what Slop is for, and what follows here

Delegated by the owner ("research them thoroughly and go with the answer that
aligns with the goal of the project"). The statement is in `docs/slop.md`
("Target and boundary"); this is the evidence and the consequence for
pipelines.

Decided: Slop's target is the POSIX.1-2024 Shell Command Language as scripts
and `-c` commands use it, measured against two corpora (what the catalog runs
inside images; what agents type inside Dolly). It is never Bash, never an
interactive job-control shell, and never a process that copies itself. The
programs of a pipeline become concurrent, with `&` and `wait` for programs on
the same mechanism; in-process stages stay serial.

Why, against `AGENTS.md`:

- Goal: "run agents such as pi agent as natively as possible in a browser with
  the tools that coding agents actually need", and the thesis "Agents are
  effective through shells and conventional command-line tools". The shell an
  agent and an upstream script both already know is POSIX `sh`. A private
  dialect has to be taught: the Pi skill spends eleven lines on it
  (`demos/pi/skills/dolly/SKILL.md:52-62,76-77`).
- "Prefer unchanged upstream source ... over source forks and per-program
  compatibility patches": upstream build scripts are `sh` scripts.
- "Never keep/add code that 'might be useful in the future'": so features
  enter by corpus need, not by reading the standard front to back.
- "Unsupported operations fail explicitly": the refusals by name.
- "Prefer simple serial semantics over multiprocessing or performance
  machinery": kept as written. Slop itself stays serial and gains no threads,
  scheduler or job control. A pipe between two programs is the one place where
  the serial form is not the same semantics but a different, worse one: the
  producer cannot be stopped, nothing streams, and the spool of
  `seq 1 999999999 | head` is 9.9 GB of text in an 8 GiB kernel memory. The kernel
  mechanism exists and Make uses it; no machinery is added for speed.
  `AGENTS.md` was not edited. If the owner wants the sentence to say this, a
  wording: "Prefer simple serial semantics; processes run at the same time
  only where a pipe, Make or `xargs` asks for it."

Evidence (measured 2026-10-06 on `core/decisions`; regex counts, close but not
exact):

- Catalog, in-image shell text: 424 `SLOP` lines, 22 script bodies and four
  in-image scripts (195 lines), 16 embedded Makefiles (151 recipe lines). Used:
  `|` 21 (13 are `gzip -dc ... | tar -xf -`), `$( )` 10, `[`/`test` 13,
  `for` 7, `if` 7, `case` 5, `&&`/`||` 6, `${x%...}` 3, one function. Zero:
  `while`, subshells, here-documents, backticks, `$(( ))`, `&`, `wait`, `trap`,
  `[[`, arrays, `<( )`, `local`, `eval`, `exec`, `read`.
- Upstream scripts run with Slop as `/bin/sh`: CMake's `bootstrap`
  (`demos/cmake/Dollyfile-cmake-build:80`; 2,111 lines; lines with backticks
  102, `if` 140, `for` 57, `|` 33, `eval` 12, `case` 8, functions 5; zero `&`,
  `wait`, `trap`, `$((`, `[[`), the Makefiles of CPython, Emacs, Lua, lpeg,
  sbase and tree-sitter, and CMake- and premake-generated Makefiles. No recipe
  runs `./configure` inside Dolly. Every construct is POSIX.
- Agents: the sandbox audit (`~/Downloads/AUDIT-sandbox-painpoints.md` §3, §4,
  §11) reached for `time (...)`, `trap`, `wait`, `kill` (all fixed by
  `20261005-131650-userspace-gaps`), `&`, `$'...'` (both POSIX, open),
  `${VAR/pat/rep}`, `${VAR:off:len}`, brace expansion, `alias`, `let` (not in
  the target), and named serial pipelines "a trap for any agent that pipes a
  long job into a filter". Six host-side Pi sessions (107 commands, under
  Bash): `|` 51, here-documents 28, `||` 26, `&&` 25, `2>&1` 22, `| head` 21,
  `if` 19, `for` 13, `$(` 13; zero `&`, `wait`, `while`, `[[`. One command in
  five ends in `| head`, the shape a serial pipeline cannot cut short. No
  transcript recorded inside Dolly exists yet; the second corpus starts with
  the audits.
- An unchanged upstream shell is not available to replace Slop: dash and
  BusyBox ash run subshells, substitutions and pipelines with `fork`, and
  Dolly has spawn only (`docs/process-model.md`). busybox-w32's spawn-based
  ash was not measured here; by its source it copies the shell's state to a
  spawned child, in a fork of BusyBox, which is not target configuration.

Follows from the rule: `$'...'` moves from "rejected by name" to a defect
(POSIX.1-2024 has it and an agent typed it); `&` for programs lands with this
task; `alias`, `let`, brace expansion and the two Bash expansions stay
refused, with the POSIX form in the message.

### Plan for concurrent program stages (not implemented tonight)

Not landed with the target-identity seed batch: it changes how every pipeline
in the catalog runs and needs its own catalog round; take it in the next seed
round (with `input@0`). The steps, each checked by the done-when above:

1. Kernel, no seed change: in `fd_write_packet`
   (`src/process-kernel.c:1119`), when `pipe->readers == 0`, mark `SIGPIPE`
   pending for the writer before returning `-EPIPE`; `docs/process-model.md:79`
   then says so. Check: `test/fixtures` pipe program killed by `SIGPIPE`
   (status 141), one that ignores it sees `EPIPE`.
2. Slop, `run_pipeline` (`src/slop.c:4038`): a stage is a program stage when
   it is a simple command whose first word is literal, is no function or
   builtin and resolves on `PATH` (decided before anything runs). The output
   of a program stage is a kernel pipe (`pipe()`, both ends moved with
   `high_descriptor`, which sets close-on-exec, so a stage holds only its own
   mapped 0 and 1); the output of any other stage stays a spool file.
   `spawn_command` (`src/slop.c:2825`) returns the pid to the pipeline instead
   of calling `wait_command` when its subshell is a non-final program stage;
   the shell closes the write end at once and the read end after the consumer
   has it. After the last stage the shell waits for every started pid, left
   to right, with `wait_command`; the statuses feed `pipefail` unchanged.
3. Ctrl+C and `set -e`: `interrupt_shell` already stops the list; the shell
   sends `SIGINT` to the pids it still holds and waits for them. A stage that
   fails to spawn closes its pipe ends so its neighbours see EOF or `SIGPIPE`.
4. `&` and `wait`: `cmd &` and `a | b &` for program stages only spawn without
   waiting, set `$!` and keep at most 32 pids; `wait` and `wait PID` use
   `waitpid`; a compound command, function or builtin before `&` is refused
   ("only a program can run in the background: use slop -c '...' &"). No
   `jobs`, `fg`, `bg`.
5. Recipes: with `set -o pipefail` a consumer that stops early now fails the
   pipeline with 141. The catalog's 21 pipelines are `gzip -dc | tar`,
   `sha256sum | cut` and `find | sed | xargs`, whose consumers read to the
   end; check CMake's `bootstrap` (33 lines with `|`) in the catalog round.
6. `docs/slop.md` ("Pipelines and interrupts"), `docs/architecture.md:43-50`,
   the `help` text (`Dollyfile-system-build:388-389`) and the Pi skill
   (`SKILL.md:52-62`) lose their serial-pipeline warnings in the same commit.

## Implemented on `core/concurrent-pipelines` (2026-10-06 evening)

No browser ran and no image was built: a catalog rebuild held the machine.
Slop is verified natively; the libc part and everything inside Dolly is not.
The task stays open until the integrator has run the browser list below.

### Semantics

- **Kinds of stage.** Every stage is a subshell, as before. A stage is a
  *program* when it is a simple command whose expanded command name is no
  function, no builtin (special or regular, so `command ls`, `eval` and `exec`
  are not), no name refused by `unsupported_builtin`, and resolves on `PATH`.
  It is decided when the stage starts, after its words are expanded and before
  its redirections apply, so `"$CC" -E x.c | grep y` is a program stage. Every
  other stage runs *in the shell*: builtins, functions, compound commands
  (`{ }`, `( )`, `if`, `for`, `while`, `until`, `case`), assignments alone.
- **The connection is chosen by the producer.** A program writes to a kernel
  pipe, is not waited for, and the next stage starts at once. A stage in the
  shell writes to an unlinked spool file and finishes before the next stage
  starts, because Slop has no second thread to drain 64 KiB of pipe while it
  writes. The consumer may be either kind: a stage in the shell reads a
  program's pipe while that program runs.
- **Mixed pipeline** `producer | while read ...; do ...; done | consumer`:
  `producer` starts; the loop runs in the shell and reads the pipe as the
  producer writes; the loop's output spools; when the loop ends the shell
  closes the pipe (a producer still writing gets `SIGPIPE`), then `consumer`
  starts on the rewound spool; then the shell waits for `producer`. Streaming
  from the program into the loop, serial from the loop into the consumer.
  Not solved, by decision: an endless producer *in the shell*
  (`while :; do echo y; done | head -n1`) still never ends; `docs/slop.md` and
  the Pi skill say to write `slop -c '...' | head -n1`.
- **Waiting and status.** After the last stage the shell waits for every
  program it started, left to right (the last stage, if a program, was waited
  for when it ran). Status: the last stage's; with `pipefail` the rightmost
  non-zero one. A stage that died of a signal counts as `128 + signal`, so a
  producer cut short is 141 and `set -o pipefail; seq 1 9999999 | head -n1`
  is 141, as in Bash. `SIGINT`/`SIGQUIT` deaths stop the shell as before.
- **Early exit of a consumer.** When the last read end closes (the consumer
  exits, or the shell closes its copy after a stage in the shell), a producer
  waiting on a full pipe is woken with `EPIPE` and any later write returns
  `EPIPE`; libc raises `SIGPIPE` before `write` returns, which ends the
  producer unless it ignores, handles or blocks the signal.
- **EOF.** A reader sees EOF when every write end is closed. The shell's ends
  are close-on-exec above descriptor 9 (`high_descriptor`); the write end is
  on the shell's descriptor 1 only while the producer is spawned and is
  closed before the next stage starts, so a stage holds no end of a pipe but
  its own 0 and 1, and no later stage or background program inherits one. A
  program a producer starts itself inherits its 1 and delays EOF, as on Unix.
- **`&`.** `PROGRAM [ARG...] [REDIRECTIONS] &` and `a | b &` (every stage a
  program) start without waiting; the list continues with status 0. Standard
  input of the first stage is `/dev/null` unless redirected (POSIX without job
  control). `$!` is the PID of the last stage; it is unset before the first
  `&` and a subshell's `$!` does not leave it. `wait` collects every
  background program and returns 0; `wait PID...` collects those and returns
  the last one's status, 127 for a PID the shell does not hold (also one
  `wait` already collected: Bash remembers such a status, dash does not).
  At most 32 are held. A background program ends with the Slop process that
  started it (the kernel reclaims the subtree at exit); a subshell is the same
  process, so `wait` there sees the same programs.
- **Refused by name:** `jobs`, `fg`, `bg` (no job control); `&` after a
  compound command, a builtin, a function, or a `!`, `&&` or `||` list, each
  of which would need a copy of the shell: "only a program can run in the
  background; use slop -c '...' &". The `&&` refusal stops the script with
  status 2 but is found when its last pipeline is reached, after the earlier
  ones ran.
- **Terminal output** of concurrent stages interleaves in the order the
  writes reach the kernel; each `write` call is whole (the kernel dispatches
  one call at a time).
- **Ctrl+C** reaches the whole foreground tree, so every stage gets `SIGINT`;
  the shell still waits for all of them. Step 3 of the plan (the shell sending
  the signal itself) was not needed for that and is not implemented: after
  `kill -INT` of the shell alone, its stages run on until their pipes close.

### SIGPIPE: decided in libc, not in the kernel (differs from plan step 1)

Read in `src/process-kernel.c`: the kernel already does everything but the
signal. `release_descriptor` runs at close and at exit (`mark_process_exited`,
before the Worker retires) and sets `pipe_changed`; the supervisor then
retries parked calls (`dolly_process_take_wakeup`), so a parked read returns 0
when `writers == 0` and a parked write returns `-EPIPE` when `readers == 0`.
No kernel change and no `process.h` change is needed.

Options for the signal:

1. Kernel marks `SIGPIPE` pending in `fd_write_packet` (the recorded plan; no
   seed change). The kernel does not know dispositions: delivery waits for the
   writer's next call, and `DOLLY_PROCESS_EXIT` reports any pending
   terminating signal as the cause of death, so a program that *ignores*
   `SIGPIPE` and exits straight after the failed write would be recorded as
   killed by it (`pipe-check broken` is exactly that program).
2. libc raises it: `if (result == -EPIPE) raise(SIGPIPE)` in `__wasi_fd_write`
   (`src/process/libc-adapter.c`), the only caller of `FD_WRITE`. Delivery is
   synchronous, in the writing thread, and honours `SIG_IGN`, handlers and the
   mask through the existing `deliver_pending`. One line; a seed change, which
   the Slop change is anyway.

Taken: 2. A runtime that does not use this libc must do the same; none exists.
`pipe-check` now checks both dispositions (`broken` ignores and sees `EPIPE`;
`sigpipe` is killed, and `pipe-driver` requires `WTERMSIG == SIGPIPE`).
UNVERIFIED: these run only in the process smoke of `npm run build:runtime`.

### What the native tests prove

`test/slop.test.mjs` now builds a second ASan/UBSan binary that links
`test/fixtures/native-spawn.c` (`posix_spawn` with the same inheritance rule
as `INHERIT_FDS_ALL`) and runs `pipelineCases` in it and in Bash: Linux
processes, pipes and `SIGPIPE` stand in for the kernel's. It proves the
shell's part: stages start without waiting, pipe ends do not leak (EOF
arrives, an endless `seq` is cut short within the 5 s timeout), the spool
boundary, `pipefail` with 141, `$(...)`, `&`, `$!`, `wait`, no leaks. It does
not prove the kernel's wake-ups, the libc `SIGPIPE`, the 32-process limit,
Worker start-up order, or that a background program ends with its shell.
`node --test test/slop.test.mjs`: 148 of 148 pass (evidence in
`build/pipelines-evidence/`, not committed). `node --test test/*.test.mjs`:
269 of 273; the four failing files import `dist/` modules, which this
source-only checkout does not have.

Checked once by hand under ASan, not kept as a case because 32 Workers at
once is not for the browser suite: 40 times `sleep 1 &` holds 32 and refuses
8 by name, and `wait` collects the 32.

Found, not from this change and not fixed: a `while` loop left by
`test ... && break` returns 1 where Bash returns 0
(`i=0; while :; do i=$((i+1)); test $i = 3 && break; done; echo $?`), with or
without a pipe; the Slop of the commit before this branch does the same. With
`pipefail`, `producer | while ...; do ... && break; done` therefore reports 1
where Bash reports the producer's 141.

### For the integrator, in a browser (nothing below was run)

    npm run build:runtime          # seed change: libc adapter, slop; runs pipe-driver
    DOLLY_IMAGE_JOBS=1 DOLLY_BUILD_IMAGES=default /home/daug/dev/dolly/work/build-slot.sh npm run image
    node test/core-browser.mjs chromium     # runs test/slop-browser.mjs: all pipelineCases
    node test/core-browser.mjs firefox

Done-when by hand in the `default` image: `seq 1 999999999 | head -n1`
returns at once; `make 2>&1 | tee log` shows output while Make runs;
`sleep 5 & echo $!; wait` ; `yes` is still not installed (sbase's is not in
the tool list), so `yes | head -1` is covered natively only.

Not done, because recipes were frozen tonight and an edit makes the pin of
`Dollyfile-system-build` stale (six source tests fail on it): the `help` text
(`Dollyfile-system-build:388-389`) still says pipelines are serial and `&` is
unsupported. Replace those two lines with:

    not supported: job control (jobs, fg, bg), aliases, umask, ulimit, brace expansion {a,b}, ${VAR/a/b}, ${VAR:1:2}, $'...'; a glob that matches nothing stays as typed
    pipelines: programs run at the same time, so seq 1 999999999 | head -n1 ends at once; a builtin, function or compound stage finishes before the next stage reads its output
    background: PROGRAM & and a | b & start programs; $! is the last PID; wait [PID...] collects them; wrap anything else as slop -c '...' &

### Recipes (read, not edited)

`SLOP` lines run `slop -e -c` without `pipefail` (`src/dollyfile.c:886`), and
no in-image recipe sets it (the `set -euo pipefail` scripts are host-side
Bash), so no recipe can fail with 141. What changes for each shape:

- `gzip -dc A | tar -xf - -C D` (twelve recipes: rust-sdk, zero-ad-engine
  twice, zero-ad-deps, neovim-build, llvm-tablegen, classicube-build,
  rts-arena, rts-build, cmake-build, emacs, python) and the Codex
  `cat parts | ...` line: two Workers at once and no spool of the
  decompressed archive in kernel memory. If `tar` stops at the end-of-archive
  marker before `gzip` has written its last block, `gzip` dies of `SIGPIPE`;
  the status is still `tar`'s. Needs: nothing, but watch peak memory on the
  largest archives (LLVM, 0 A.D.).
- `sha256sum F | cut -d ' ' -f 1` (qwen3.5-2b, minicpm5-2b) and
  `find ... | sed ... | xargs rm -f` (emacs): consumers read to the end.
  Needs: nothing.
- CMake's `bootstrap` (33 lines with `|`, backticks) runs under Slop in
  `cmake-build`: its pipelines now run concurrently. Needs: the catalog round.
- No recipe relies on a stage finishing before the next starts (none writes a
  file in one stage that a later stage of the same pipeline reads).

### Commits

- `fdc6f7aa` libc `SIGPIPE` (unverified), `5401da70` and its follow-up Slop
  (natively verified), `87643c2b` tests (natively verified), `ef23c428` docs.
- Process ABI: unchanged (`include/dolly/process.h`, `abi/`, the kernel and
  the supervisor are untouched). Seed: changed (`src/slop.c`,
  `src/process/libc-adapter.c`), so every image is invalid after this branch.
