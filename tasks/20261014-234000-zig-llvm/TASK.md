# Zig with LLVM inside Dolly, and `zig build`

- STATUS: OPEN
- PRIORITY: 190
- TAGS: zig,toolchain,packages,owner

Owner (2026-10-14): "I want as close to pure zig as possible", then "I want
this", for building Ghostty with its own `build.zig`
([Ghostty in X11](../20261014-232500-ghostty-x11/TASK.md)). Today's Zig has
only the C backend: `zig build`, `zig run`, `zig test` and `zig cc` end with
"development environment cbe does not support feature …"
([follow-ups](../20261001-091000-zig-follow-ups/TASK.md)).

Done when a Zig 0.16 built inside Dolly against LLVM runs `zig build` on a
project of its own and `zig build-exe hello.zig` gives a program that runs
in a session, with a browser test.

## State (2026-10-15, 01:00): building, branch `demo/zig-llvm` (worktree `work/zig`)

Settled before any Dolly build, with the host's Zig 0.16 (LLVM 21) and the
patched standard library: objects it emits for `wasm64-emscripten`
(`-mcpu=generic+atomics+bulk_memory`) link with Dolly's `cc` and run in a
session, Debug and ReleaseSafe; one starts `echo` in `/tmp` through a pipe
and waits for it (exit 0). So the open question of the plan is answered:
Zig compiles, `cc` links. The patched compiler type-checks for the target
with LLVM enabled (`-fno-emit-bin`, the same command zig1 runs).

The demo's patch (`demos/zig/zig-0.16.0-dolly-llvm.patch`, over the core's):
spawn by `posix_spawn` (dup2 and chdir actions); an Emscripten program's
link handed to `cc`; a wasm host's native CPU is the compiler's own (the
fallback, lime1, lacks atomics, and a Dolly program shares its memory);
`/proc/self/exe` (Dolly's kernel answers it); libc linked by default, as for
FreeBSD, NetBSD and OpenBSD; `zig build`'s runner reads `ZIG_LIBC`. In the
core's patch the same hunks made every image from `zig-build` on stale.

Images: `llvm21-tablegen`, `llvm21` (LLVM 21.1.8 with upstream's
`a558d656` backported: its RDF gives `std::less` state, which LLVM 24's
libc++ refuses; PIC off, since shared libraries link with version scripts),
`zig-llvm-build` (zig1's C and its objects, no LLVM, so it builds beside
`llvm21`) and `zig-llvm` (zigcpp and the link). Test
`demos/zig/test/zig-llvm-browser.mjs`.

## Plan (2026-10-14, 23:40): after the round of 2026-10-14

1. `llvm21`: a package with LLVM 21's libraries and headers under
   `/usr/lib/llvm21`, built by the configuration the three LLVM recipes
   share. Zig 0.16 asks for exactly LLVM 21 (`CMakeLists.txt:136`); Dolly
   builds 24 (`llvm`) and 22 (`rust-llvm`), and Zig binds LLVM's C++ API.
   Versioned names for library packages that coexist; `llvm` stays the
   compiler package at the seed's version.
2. Zig 0.16 by upstream's CMake build, `USE llvm21`, linked statically, so
   an installer needs no LLVM.
3. One patch to Zig's standard library: it starts processes with fork and
   execve (`lib/std/Io/Threaded.zig:14871`, `spawnPosix`; `posix_spawn` only
   on Darwin). Dolly has `posix_spawn` and no fork.
4. The open question, to settle first with `zig build-exe hello.zig`: a Dolly
   executable is linked with Dolly's libc, process stamp and host records,
   which `cc` adds today. Whether Zig's linker and `zig cc` can do that, or
   the final link goes to `cc`, is not known.
