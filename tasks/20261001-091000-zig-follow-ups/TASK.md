# Zig self-host follow-ups

- STATUS: CLOSED
- PRIORITY: 140
- TAGS: toolchain,zig,display

## Closed into `20261009-110500-rust-followups` (2026-10-13)

From merging `work/zig-self-host` (2026-10-01): Zig is built inside Dolly and emits Ghostty as C.

Done since:

- The kernel-plugin contract imports `strlen`, `memcmp` and `bcmp` from the kernel's libc, so
  the display plugin no longer carries its own.
- **A test runs Zig as a user would**: the `zig` row of `test/amy-browser.mjs` installs the
  package into `default`, compiles a Zig function to C and calls it from a C program, and
  builds and runs a program on Zig's standard library (from `20261001-014500-zig-sdk-browser`).
- **What `zig build`, `zig run` and `zig test` print is recorded** (from
  `20261006-103306-zig-child`). Measured on 2026-10-13 in Chromium, `default` after
  `amy install zig`: each ends with status 126 and one line, `panic: development environment
  cbe does not support feature build_command` for `zig build`, `wasm_linker` for `zig run` and
  `zig test`, `cc_command` for `zig cc`, `fmt_command`, `version_command`, `help_command`. This
  Zig is built with the C backend alone (`src/zig/config.zig`), which is the reason
  `docs/display.md` gives; `man zig` names the missing commands and shows the two that work.
  A Zig that could start a process would be a different build of Zig, not a fix here.

Left, and moved to `tasks/20261009-110500-rust-followups` ("From Zig"): the committed
`src/ghostty/generated/` (5.4 MB), the size of `libdisplay.so`, and WAMR's
`-DBUILD_TARGET_X86_64`.

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

