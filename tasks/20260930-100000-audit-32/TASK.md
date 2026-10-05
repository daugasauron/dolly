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
