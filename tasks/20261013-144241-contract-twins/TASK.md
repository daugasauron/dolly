# The process contract loses its twins, and each module gets a block of operation numbers

- STATUS: OPEN
- PRIORITY: 235
- TAGS: core,process,abi

Owner (2026-10-13): "I want to get the core right, Dollyfile syntax, host
modules/bridge, browser runtime etc. It should be as clean and small as
possible in order to be extensible. Think unix philosophy (this is a core
thing)." One issue of
[the reflection on the direction](../20261013-142800-direction/TASK.md)
([reflection](../20261013-142800-direction/reflection.md), section 1).

Done when: one operation where two did one thing (a descriptor's and a
path's stat, filesystem stat and times; sizes and contents of the arguments
and of the environment; the two pairs of flags; a clock resolution that is a
constant), with `READ` and `PREAD` kept apart; every module's operations in
a block of its own, asserted by a test; the five `VERSION` globals gone.

## As filed (2026-10-13, main `e330d782`)

- 50 operations (`include/dolly/process.h`). Twins: `FD_STAT`/`PATH_STAT`,
  `FD_STAT_FILESYSTEM`/`PATH_STAT_FILESYSTEM`, `FD_SET_TIMES`/`PATH_SET_TIMES`
  though the path request already carries `directory_descriptor`
  (586-592); `ARGUMENT_SIZES` with `ARGUMENTS`; `CLOCK_RESOLUTION` returns a
  constant (`src/process-kernel.c:2201-2215`). Three conventions of packet
  in one contract: `TERMINAL` alone multiplexes six sub-operations
  (298-305), `FD_LOCK` alone changes its response by a flag (157-159).
- `download` uses operation 51 and `upload` 57, inside the core's 48-59;
  `process.h:110` says "never reuse a number below" and nothing says where
  a module starts. `test/host-modules.test.mjs:114` already checks
  collisions.
- Seed.
