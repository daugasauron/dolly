# Zig with LLVM

Zig 0.16 with its LLVM backend, built inside Dolly the way upstream's CMake
build makes zig2, against LLVM, Clang and LLD 21 (the `llvm21` package of
[the LLVM demo](../llvm/README.md)). The `zig` package of the core has only the
C backend; this one is the compiler upstream ships, so `zig build` can follow
(task `tasks/20261014-234000-zig-llvm`).

## Images

- `zig-llvm`: `zig` with its LLVM backend; the LLVM libraries are linked in, so it brings no LLVM.
