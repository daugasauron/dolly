# A shell's Ctrl+C policy leaves the process contract: SPAWN_INTERACTIVE goes

- STATUS: OPEN
- PRIORITY: 280
- TAGS: core,process,abi,slop

Owner (2026-10-13): "I want to get the core right, Dollyfile syntax, host
modules/bridge, browser runtime etc. It should be as clean and small as
possible in order to be extensible. Think unix philosophy (this is a core
thing)." One issue of
[the reflection on the direction](../20261013-142800-direction/TASK.md)
([reflection](../20261013-142800-direction/reflection.md), section 1).

Done when: the contract has no `DOLLY_PROCESS_SPAWN_INTERACTIVE`; Ctrl+C
ends the foreground program and leaves the shell that waits for it, because
the shell ignores the signal while it waits, as on Unix; on the display's
terminal and in a pane; the suites pass.

## As filed (2026-10-13, main `e330d782`)

- "An interactive owner with running descendants is spared"
  (`include/dolly/process.h:181`), implemented twice
  (`src/process-supervisor.mjs:275-279`, `src/process-kernel.c:180-195`):
  a shell's decision about how Ctrl+C reaches it, written as a spawn flag.
  POSIX says the same with `SIG_IGN`, which `src/process/signal.c:107`
  already honours. `SPAWN_FOREGROUND` is mechanism (who owns the terminal)
  and stays.
- Not judged by reading: whether Slop can ignore `SIGINT` across its wait
  cleanly without the flag. Measure that first.
- `process.h` and `slop.c` are in the seed: its commit goes on the seed
  branch, tested on the base chain.
