# In-house commands duplicate sbase and shared helpers

- STATUS: OPEN
- PRIORITY: 160
- TAGS: commands,core,cleanup

13 commands in `modules/agent-tools.dm` (tail, tee, du, dd, install, rev, printenv, uname,
hostname, tty, which, rm, mkdir) and core-tools' ls/cp/mv/test/cat/echo/touch/pwd exist in the
pinned sbase without fork dependencies. PATH lookup exists in ~10 copies (`slop.c:1676`, `4311`,
command, env, xargs, timeout, find, time, which, `dollyfile.c`), `join_path` in 5 (`du.c:58`,
`install.c:79`, `find.c:148`, `core-tools.dm:352`, `908`), spawn/wait boilerplate 8 times.
`modules/sbase-tools-{1..12}.dm` are 12 near-identical modules (469 lines); `SBASE_TR_UTF` is
defined in 13 and used in 2. `docs/sources.md:104` lists 5 sbase tools (about 35 ship).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Minimal in-house code: prefer unchanged upstream tools; share helpers once.

## Done when

- In-house duplicates replaced or justified; sbase modules consolidated; browser tests for
  affected commands pass.
