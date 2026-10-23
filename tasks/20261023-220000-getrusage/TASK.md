# getrusage reports success with an invented user time

- STATUS: OPEN
- PRIORITY: 140
- TAGS: core,libc,0.1.5

Found by the OCaml port (2026-10-23, `tasks/20261023-210000-ocaml/TASK.md`): `getrusage`
returns 0 with a user time of 1.000002 s whatever the process did, and `times` reports 0.
Neither is in Dolly's adapter (`src/process/runtime-adapter.c`): they are Emscripten's stubs.
AGENTS.md: "an unimplemented operation cannot return success". OCaml's `Sys.time` now reads
the clock instead (its patch); other ports may trust the invented value.

Fix: the adapter answers `getrusage` and `times` with `ENOSYS` (Dolly accounts no CPU time),
or with real numbers if the kernel ever accounts them. It is a seed change, so it rides the
next catalog round, not 0.1.4's.

Done when: a test program sees `getrusage` fail with `ENOSYS` (or report its real time), and
the catalog's ports still pass.

Also from the port, no change planned: `posix_spawn_file_actions_addclose` is refused with
`ENOTSUP` (the spawn contract carries dup2 and chdir only; OCaml makes no close action), and
the libc has no `gethostbyaddr` (OCaml raises `Not_found`).
