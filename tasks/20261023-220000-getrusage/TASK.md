# Emscripten's libc stubs that claim success: getrusage, times and the rest

- STATUS: OPEN
- PRIORITY: 160
- TAGS: core,libc,0.1.4

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

## State (2026-10-23, 19:10)

- `getrusage`: fixed in `03717431` (core/npm-packages): the adapter answers with the rule
  `clock()` already follows, the time since the process started as user time; a check in
  `test/fixtures/process-lifecycle.c` fails on the old stub. Not yet run in a browser.
- `times`: Emscripten's is a strong definition in `emscripten_libc_stubs.o` of `libstubs.a`,
  which a link pulls in for `getpwnam` and others, so the adapter's own collided ("duplicate
  symbol: times", make's link); `llvm-objcopy` cannot weaken a Wasm symbol. Reverted in
  `230716d6`. Taking the object over (`emar d` it from the staged `libstubs.a`, as
  `scripts/prepare-process-sysroot.sh` does for `raise.o` and the signal objects, and define
  what it held) is the way.
- The rest: `emscripten_syscall_stubs.c` and `emscripten_libc_stubs.c` hold more stubs that
  return success without doing the thing (`mprotect` "let's not and say we did", `mlock`,
  `madvise`, `setsid`, `getpriority`, `getresuid32`, `sync`, ...). Each needs a decision:
  honest result, explicit failure, or a recorded reason it is right for Dolly (`mprotect`
  succeeding is what OCaml's minor heap and other ports rely on).

Done when: every stub of both files that a Dolly program can reach is listed here with what
Dolly does and why; those that claim success falsely answer honestly or fail explicitly; a
test shows each change; the catalog's ports still pass.
