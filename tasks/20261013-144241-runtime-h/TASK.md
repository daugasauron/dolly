# runtime.h is spawn and wait: what libc has leaves it

- STATUS: OPEN
- PRIORITY: 245
- TAGS: core,process,abi

Owner (2026-10-13): "I want to get the core right, Dollyfile syntax, host
modules/bridge, browser runtime etc. It should be as clean and small as
possible in order to be extensible. Think unix philosophy (this is a core
thing)." One issue of
[the reflection on the direction](../20261013-142800-direction/TASK.md)
([reflection](../20261013-142800-direction/reflection.md), section 1).

Done when: `runtime.h` declares what POSIX lacks, a spawn without fork and
its wait, and nothing libc already has; Slop, the JavaScript runtime and the
demos that called the rest call libc.

## As filed (2026-10-13, main `e330d782`)

- 19 functions. `dolly_isatty`, `dolly_kill`, `dolly_waitpid`,
  `dolly_terminal_mode_*` and `dolly_write_file` duplicate libc
  (`src/process/libc-adapter.c:51` is `isatty() { return dolly_isatty(); }`);
  six spawn wrappers of one call (`runtime-adapter.c:123-178`). Callers
  outside `src/process`: seven demo files, Slop, `dollyfile.c`, `amy.c`.
- Whether `dolly_terminal_publish_result` stays is
  [the test surface](../20261013-144241-test-surface/TASK.md)'s question.
- Seed.
