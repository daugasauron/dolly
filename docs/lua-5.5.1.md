# Upstream Lua 5.5.1 experiment

Dolly builds the Lua 5.5.1 interpreter from the official release archive. Its
URL and checksum live in the canonical [`source-pins.sh`](../config/source-pins.sh)
manifest. The archive is downloaded at build time and is not vendored. Every
`src/*.c` file except the separate `luac.c` executable is passed unchanged to
`bin/dolly-cc`, along with `-lm`.

The resulting 225 KiB wasm64 side module:

- exports the ordinary Lua C API and the rewritten `dolly_main` entry;
- imports Dolly's shared memory64, table64, libc, and runtime data symbols;
- initializes relocated BSS with a WebAssembly start function;
- supplies its own `luaopen_*` functions and Lua data-address GOT targets;
- reads a file created by another command and writes a file read by the main
  runtime;
- runs its unchanged interactive REPL over Dolly's blocking fd 0 device;
- accepts Ctrl+C as a canonical input-line interruption and Ctrl+D as EOF;
- consumes source through a WasmFS pipe;
- unloads, reloads, and repeats successfully in the same browser instance.

When Lua was introduced, the probe contract had 96 imports: shared
dynamic-linking primitives, runtime data relocations, 81 libc/runtime functions
observed from Lua, three directory functions required by `ls`, and two Dolly
lifecycle functions. Lua itself has 104 imports, but 20 of those are self-GOT relocations
and therefore do not expand Dolly's capability API.

## Boundary result

Lua's ISO C library references include `system`, `exit`, signals, time-zone
conversion, and setjmp even when a particular script does not use all of them.
The proof deliberately calls `os.execute`. Under Dolly's browser-worker build,
Emscripten's `_emscripten_system` returns `ENOSYS` for non-null commands;
the browser test verifies the call fails and creates no file. The generated
loader contains no Node filesystem or subprocess implementation.

Source builds map `exit` to Dolly's command-local lifecycle operation. Fatal
`abort` still terminates the shared runtime. Dolly wraps returns and `exit` in a
bounded synchronous `spawn`/`wait` transition, but side modules remain dynamic
objects in one address space rather than isolated processes.

## Design consequence

This proves that an existing language runtime can use the shared in-Wasm
filesystem with no source port. It does not prove that 81 libc functions are
the right stable ABI. The direct-libc surface is an Emscripten dynamic-linking
artifact. The next ABI experiment should move libc behind a smaller set of
descriptor, path, clock, entropy, and lifecycle operations, then rebuild Lua
unchanged against that target and compare the import surface.
