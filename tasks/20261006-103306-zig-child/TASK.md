# Zig cannot start a child process

- STATUS: OPEN
- PRIORITY: 180
- TAGS: zig,process,docs

Found by the static scan of `20261005-222449-spawn-users` (release build
`5439ebe7`, 2026-10-06).

## Measured

`/usr/bin/zig` (8.25 MB, in `zig-build` and `ghostty-build`) reaches WAIT (65)
and SIGNAL (68) but no SPAWN (64). Its name section keeps `waitpid`, `kill`
and `execve`, and neither `fork`, `vfork` nor `posix_spawn`: Zig's standard
library has no way to start a process on the Emscripten target this Zig is
built for, so the wait and kill halves are there with nothing to wait for.

## What it affects

[display](../../docs/display.md#zig-and-the-ghostty-build) already says this
Zig emits only C and has no `zig build` or `zig cc`. The missing spawn is a
second, separate reason for `zig build`, and it also covers what the C
backend could otherwise do with `cc` beside it: `zig build` (runs the build
runner), `zig run` and `zig test` (run what they compiled). `zig build-obj`
and `zig build-lib -ofmt=c`, which the Ghostty build uses, start nothing.

Not yet run in a browser: what a user sees for each of these commands in
`ghostty-build` is to be recorded here.

## Done when

- The messages are recorded, and either the docs name the commands that
  cannot work and why, or Zig's process spawn is ported to `posix_spawn` for
  this target (a patch beside `patches/zig-0.16.0-dolly-native.patch`) and
  `zig run` of a hello program passes in `ghostty-build`.
