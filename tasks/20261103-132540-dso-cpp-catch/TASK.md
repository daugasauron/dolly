# A C++ catch in a dso@0 library does not catch: the host's TLS exports are offsets

- STATUS: OPEN
- PRIORITY: 120
- TAGS: bug,host-modules,compiler

## State (2026-11-03)

Reproduced in Chromium; not fixed. Rust is not affected: its landing pads catch all and call no
personality, so they never touch `__wasm_lpad_context`
([rust-followups](../20261009-110500-rust-followups/TASK.md)).

## Reproduction

In `default` after `amy install cc`, a library that throws and catches an `int` itself, loaded
by an `-rdynamic` program:

    // lib.cpp: c++ -shared -fPIC lib.cpp -o lib.so
    struct Guard { const char *n; ~Guard() { std::printf("drop %s\n", n); } };
    extern "C" int inside() { try { Guard g{"lib"}; throw 5; } catch (int v) { return v; } return 0; }
    // main.cpp: c++ -rdynamic main.cpp -o main; dlopen("./lib.so"), then inside()

`./main` prints `drop lib` (the cleanup runs) and the process fails with
`[object WebAssembly.Exception]`, status 126: the `catch (int)` never matches.

## Cause

The library imports `GOT.mem.__wasm_lpad_context`, the landing-pad context that WasmEHPrepare
makes thread-local. The executable exports that variable as wasm-ld exports every TLS symbol of
a static link: its offset in the TLS block (`(global i64 (i64.const 88))`), while its own code
reaches it at `__tls_base + 88` (`__wasm_apply_global_tls_relocs`). The loader
(`host/dso/process.mjs`) gives the import the export's value, so the library's landing pad
writes its index and LSDA to address 88, and libc++abi's `__gxx_wasm_personality_v0` in the
executable reads the real context, finds no handler and unwinds on.

The `__cpp_exception` tag, `__cxa_*` and the personality resolve correctly (the tag import is
the executable's tag). A library's own thread-locals were not examined.

## Done when

A library's typed `catch` catches an exception thrown in it and one thrown by the executable
through it, in Chromium and Firefox, with a test in `test/dso-browser.mjs`. The loader needs to
know which of the executable's exports are TLS offsets and its `__tls_base` (the executable's
processes that host libraries are single-threaded); wasm-ld records that only in a PIC output's
`dylink.0`, so the executable has to say it some other way.
