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
