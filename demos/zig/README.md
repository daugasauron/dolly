# Zig with LLVM

Zig 0.16 with its LLVM backend, built inside Dolly the way upstream's CMake
build makes zig2, against LLVM, Clang and LLD 21 (the `llvm21` package of
[the LLVM demo](../llvm/README.md)). The `zig` package of the core has only the
C backend; this one is the compiler upstream ships, with `zig build`
(task `tasks/20261014-234000-zig-llvm`).

Dolly's patch to Zig (`config/zig-0.16.0-dolly-native.patch`, shared with the
core's Zig) starts processes with `posix_spawn`, since Dolly has no `fork`,
and hands an Emscripten program's link to `cc`, which adds the libc and the
process records. `ZIG_LIBC` names the libc's directories.

## Images

- `zig-llvm-build`: build-only; zig1 compiles the compiler to C and `cc` compiles that.
- `zig-llvm`: `zig` with its LLVM backend; the LLVM libraries are linked in, so it brings no LLVM. It brings `cc` for its links.

## Test

`node demos/zig/test/zig-llvm-browser.mjs` installs `zig-llvm` into a default
session: `zig build-exe` builds a program that starts a child, and `zig build`
builds it from a `build.zig`.
