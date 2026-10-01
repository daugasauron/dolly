# Slop pipeline limits stall common agent commands

- STATUS: OPEN
- PRIORITY: 180
- TAGS: slop,core,compatibility

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
