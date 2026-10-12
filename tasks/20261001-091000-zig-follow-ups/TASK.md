# Zig self-host follow-ups

- STATUS: OPEN
- PRIORITY: 140
- TAGS: toolchain,zig,display

## State (2026-10-12)

From merging `work/zig-self-host` (2026-10-01): Zig is built inside Dolly and emits Ghostty as C.
Done since: the kernel-plugin contract imports `strlen`, `memcmp` and `bcmp` from the kernel's
libc, so the display plugin no longer carries its own. Nothing else on this list has moved since
2026-10-07. Left:

- **`src/ghostty/generated/` is committed output**: 5.4 MB; `uucode-tables.zig` alone is
  233,478 lines, 89% of the lines under `src/` when counted on 2026-10-05. Generate it with the
  upstream Zig generators inside Dolly and drop the checked-in copy: the largest deletion
  available in the core tree.
- **WAMR is compiled with `-DBUILD_TARGET_X86_64`** (`Dollyfile-zig-build:35`). The guest never
  observes it ("WAMR target", below), but it is dead configuration for a CPU Dolly is not; an
  honest form needs a WAMR source change or an upstream generic target.
- **`libdisplay.so` grew 63%** (1,007,438 to 1,644,382 bytes) with Ghostty emitted as C instead
  of compiled by an LLVM Zig. Not measured: where the size comes from, and whether `cc` flags
  recover it.
- **No test runs Zig as a user would**: the in-sandbox Zig compiling a small Zig program and a
  C interop case through its C output and `cc` (from `20261001-014500-zig-sdk-browser`).
- **`zig build`, `zig run` and `zig test` cannot work**: Zig's standard library has no way to
  start a process on this target (from `20261006-103306-zig-child`). `docs/display.md` says
  there is no `zig build` or `zig cc` and gives the missing LLVM as the reason; what a user
  sees for each command is not recorded. Either the document names them with the real reason,
  or Zig's spawn is ported to `posix_spawn` and `zig run` of a hello program passes.

Lowered from 180: nothing here blocks a user or a build.

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

