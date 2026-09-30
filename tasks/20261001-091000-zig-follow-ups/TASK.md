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
