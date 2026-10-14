# Zig with LLVM

Zig 0.16 with its LLVM backend, built inside Dolly the way upstream's CMake
build makes zig2, against LLVM, Clang and LLD 21 (the `llvm21` package of
[the LLVM demo](../llvm/README.md)). The `zig` package of the core has only the
C backend; this one is the compiler upstream ships, with `zig build`
(task `tasks/20261014-234000-zig-llvm`).

[`zig-0.16.0-dolly-llvm.patch`](zig-0.16.0-dolly-llvm.patch), over the core's
(`config/zig-0.16.0-dolly-native.patch`), starts processes with `posix_spawn`,
since Dolly has no `fork`; hands an Emscripten program's link to `cc`, which
adds the libc and the process records; takes the host's CPU as the one the
compiler was built for (Zig's fallback has no atomics, and a Dolly program
shares its memory); reads `/proc/self/exe`; links libc by default, as for
FreeBSD; and lets `zig build`'s runner read `ZIG_LIBC`, which names the libc's
directories.

zig2 is built with every command (`dev = .full`): upstream builds the full
compiler with zig2, and here zig2 is the compiler. A program for Dolly is
`NAME.wasm`. In a session (2026-10-15), `zig build-exe hello.zig` took 7.8 s
and `zig build` of a one-program project 13.5 s; zig1 makes the compiler's C
in about 16 minutes, and `llvm21` builds in 75.

## Images

- `zig-llvm-build`: build-only; zig1 compiles the compiler to C and `cc` compiles that.
- `zig-llvm`: `zig` with its LLVM backend; the LLVM libraries are linked in, so it brings no LLVM. It brings `cc` for its links.

## Test

`node demos/zig/test/zig-llvm-browser.mjs` installs `zig-llvm` into a default
session: `zig build-exe` builds a program that starts a child, and `zig build`
builds it from a `build.zig`.
