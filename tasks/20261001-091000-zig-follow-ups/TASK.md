# Zig self-host follow-ups

- STATUS: OPEN
- PRIORITY: 180
- TAGS: toolchain,zig,display

From merging `work/zig-self-host` (2026-10-01):

- WAMR is compiled with `-DBUILD_TARGET_X86_64` (`modules/zig.dm`). It only
  selects WAMR's generic 64-bit register path for native calls; zig1 binds raw
  natives. Check against the porting rule "do not claim AMD64": find the
  smallest target-neutral configuration (`invokeNative_general.c` exists).
- `libdisplay.so` grew from 1,007,438 to 1,644,382 bytes (+63%) with Ghostty
  emitted as C instead of compiled by LLVM Zig; measure where the size comes
  from and whether `cc` flags recover it.
- `modules/ghostty.dm` carries `strlen`/`memcmp`/`bcmp` because C-output
  compiler_rt leaves them to libc and the kernel-plugin contract lacks them;
  decide whether the contract should offer them (a contract change).
- Generate `src/ghostty/generated/` (uucode and Ghostty's Unicode tables,
  5.4 MB committed) with their upstream Zig generators inside the sandbox and
  drop the checked-in output; `src/ghostty/generated/README.md` predates
  self-hosted Zig (from `20260930-100000-audit-64`).
- Carry over the Zig SDK browser check from the closed
  `20261001-014500-zig-sdk-browser`: the in-sandbox Zig compiles a small Zig
  program and a C interop case (via its C output and `cc`).
- From `20261006-103306-zig-child` (closed into this task, 2026-10-07): `zig`
  reaches WAIT and SIGNAL but no SPAWN (static scan of the release in
  `20261005-222449-spawn-users`); its standard library has no way to start a
  process on this target, so `zig build`, `zig run` and `zig test` cannot
  work while `zig build-obj` and `zig build-lib -ofmt=c` do. Record what a
  user sees for each in `ghostty-build`; then either `docs/display.md` names
  the commands that cannot work and why, or Zig's spawn is ported to
  `posix_spawn` (a patch beside `patches/zig-0.16.0-dolly-native.patch`) and
  `zig run` of a hello program passes there.

## WAMR target (read 2026-10-01)

WAMR's `core/config.h` derives `BUILD_TARGET_*` only from native compiler
macros (`__x86_64__`, `__aarch64__`, `__riscv`, …) and has no target-neutral
choice. In the files `modules/zig.dm` compiles, `BUILD_TARGET_X86_64` affects:
- the argument marshalling for non-raw natives in `wasm_runtime_common.c`
  (System V register counts, `:5978`), which zig1 never reaches because it
  binds only raw natives;
- `DEFAULT_WASM_STACK_SIZE` (16 KiB instead of 12 KiB);
- unaligned access, which the recipe already overrides to 0.

The guest (`zig1.wasm`, wasm32-wasi) never observes the define, so this is no
detection lie toward the program, but it is dead configuration. The smallest
honest form would make non-raw native calls fail explicitly instead of
compiling a marshalling path for a CPU Dolly is not. That needs a WAMR source
change, or an upstream generic target.

## Progress (2026-10-01, branch `work/core-polish`)

The kernel-plugin contract now imports `strlen`, `memcmp` and `bcmp` from the
kernel's libc, and `modules/ghostty.dm` no longer carries `string.c`. WAMR's
`BUILD_TARGET_X86_64`: as recorded above, the guest never observes it and an
honest target needs a WAMR source change; left. The `libdisplay.so` size
measurement and the Zig SDK browser check are still open.

## Review note (2026-10-05, `20261005-131642-big-picture`)

Measured: `src/ghostty/generated/uucode-tables.zig` is 233,478 lines, 89% of
every line under `src/` (261,434) and 5.4 MB of the checkout. Generating it
in the sandbox (the fourth item above) is the largest deletion available in
the core tree.
