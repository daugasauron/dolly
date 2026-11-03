# Zig with LLVM

Zig 0.17 with its LLVM backend, built inside Dolly the way upstream's CMake
build makes zig2, against LLVM, Clang and LLD 22 (the `llvm22` package of
[the LLVM demo](../llvm/README.md)). The `zig` package of the core has only the
C backend; this one is the compiler upstream ships, with `zig build`
(task `tasks/20261014-234000-zig-llvm`).

[`zig-0.17.0-dolly-llvm.patch`](zig-0.17.0-dolly-llvm.patch), over the core's
(`config/zig-0.17.0-dolly-native.patch`, which starts processes with
`posix_spawn`, Dolly having no `fork`), hands an Emscripten program's link to `cc`, which
adds the libc and the process records; takes the host's CPU as the one the
compiler was built for (Zig's fallback has no atomics, and a Dolly program
shares its memory); reads `/proc/self/exe`; and lets the tools Zig compiles
for itself (`zig build`'s maker among them) read `ZIG_LIBC`, which names the
libc's directories, as `zig build-exe` does; and lets Zig 0.17's maker compile
for a host that is single-threaded (Zig's default on WebAssembly) and has no
file watcher, as Dolly is: upstream's maker calls its servers and watcher where
such a host has none. Zig 0.17 links libc for Emscripten by itself.

zig2 is built with every command (`dev = .full`): upstream builds the full
compiler with zig2, and here zig2 is the compiler. A program for Dolly is
`NAME.wasm`. In a session (Chromium, 2026-11-04) the first `zig build` of a
one-program project took 103 s, most of it compiling Zig's maker; zig1 makes
the compiler's C in about 20 minutes, `cc` compiles it in 8 in a 9 GB slot (6
GB is not enough), and `llvm22` builds in 75.

## Images

- `zig-llvm-build`: build-only; zig1 compiles the compiler to C and `cc` compiles that.
- `zig-llvm`: `zig` with its LLVM backend; the LLVM libraries are linked in, so it brings no LLVM. It brings `cc` for its links.

## Test

`node demos/zig/test/zig-llvm-browser.mjs` installs `zig-llvm` into a default
session: `zig build-exe` builds a program that starts a child, and `zig build`
builds it from a `build.zig`.
