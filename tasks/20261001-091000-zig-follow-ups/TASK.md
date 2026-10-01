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
- Carry over the Zig SDK browser check from the closed
  `20261001-014500-zig-sdk-browser`: the in-sandbox Zig compiles a small Zig
  program and a C interop case (via its C output and `cc`).

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
