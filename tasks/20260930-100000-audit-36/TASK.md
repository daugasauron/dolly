# In-house commands duplicate sbase and shared helpers

- STATUS: CLOSED
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

## Progress (2026-10-01)

- The twelve sbase modules are one `modules/sbase.dm`; `tee`, `dd`,
  `printenv`, `uname` and `which` come from sbase.
- Still in-house: `tail`, `du`, `rev`, `rm`, `mkdir`, `tty`, `hostname`
  (`src/commands/`) and `modules/core-tools.dm`'s ls/cp/mv/test/cat/echo/touch/pwd.
  They exist for build ordering (`6d533a7`): system-build needs them before
  Make, and sbase is built later with Make in system-tools. Compiling sbase's
  single-file tools directly with `cc` in system-build would remove most of
  them; folded into `20261001-123500-bootstrap-boundary`.

## Note (2026-10-01)

Checked on `work/core-polish`: `agent-tools.dm` is built in `system-tools`
after `sbase.dm`, so build order is not why those seven commands are in-house;
sbase has fork-free `tail`, `du`, `rev`, `xinstall`, `tty` and `hostname`, but
`test/commands.test.mjs` pins in-house behaviour (`tail -f` exits 2, `du -b`,
UTF-8 `rev`). Replacing them is a recipe and test change, not done here.

## Closed (2026-10-05, big-picture review)

Merged into `20261005-131650-userspace-gaps`, which fixes the same commands
this round and already says to use upstream first. The measure moved there:
in-house command C is 1,638 lines inline in `Dollyfile-system-build` plus
2,867 lines in `src/commands/`.
