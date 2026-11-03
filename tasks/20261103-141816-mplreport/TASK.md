# Matplotlib built inside Dolly: C++ exceptions in shared libraries, Python's thread stubs, and the build's frictions (the owner's report)

- STATUS: OPEN
- PRIORITY: 370
- TAGS: python,toolchain,dso,packages

The owner (2026-11-03, 23:20): "I tried to compile matplotlib from inside the environment and it
found a bug". The session's report is [report.md](report.md), as the owner gave it: Python and
Matplotlib built from source inside Dolly (probably on the published v0.1.4, so check each item
against the code before fixing it; some may be fixed on integrate already).

Blocking:

1. **C++ exceptions thrown and caught inside a shared library are never matched by type**
   (report section 3): every pybind11 module reports "Caught an unknown exception!", and
   `import matplotlib.pyplot` fails. The library's landing pads import `GOT.mem
   __wasm_lpad_context` as an address, while in the program that loads it (`-rdynamic`, Python)
   the symbol is thread-local: the loader hands over its TLS offset (72, `0x48`) as an absolute
   address. The personality routine reads its own thread-local context and never sees the
   library's LSDA, and every landing pad in any library writes 24 bytes at `0x48..0x60` of the
   program's memory. Reproduced in plain C++ (`lib.cpp` in the report): 15 linked statically, 240
   from `c++ -shared` and `dlopen`. The report's guess at the origin (LLVM's WasmEHPrepare makes
   the symbol thread-local only with atomics and bulk memory; `cc` refuses `-pthread -shared`) is
   unchecked. Done when the report's `lib.cpp` returns 15 from a shared library, a test proves it,
   and no loader hands a TLS offset to a `GOT.mem` import.
2. **Python's thread stubs deadlock `ThreadPoolExecutor`** (section 2): `Thread.start()` runs the
   target to completion, so the first `submit()` never returns; setuptools' `build_ext` with any
   `parallel` (Pillow sets it) hangs. The fix is real threads, `tasks/20261103-134653-pythreads`;
   until then a stub that cannot run a thread concurrently must not pretend to (it should fail at
   `start()`, so callers fall back).

The build's frictions (section 4), each to check and fix at its cause, or close with the reason:

- Python's `sysconfig` records Emscripten's flags (`-sMEMORY64=1`, `-sWASM_BIGINT`,
  `-sEXIT_RUNTIME`; `LDCXXSHARED` names `emcc`), which Dolly's `cc` refuses.
- `cc` refuses `-flto` (Matplotlib sets `b_lto`), and `-pthread` with `-shared` (HarfBuzz's
  `dependency('threads')`).
- `patch` has no `-l` or `-f` (Meson's wraps run `patch -l -f -p1 -i FILE`).
- `tar` reads no pax headers and has no `-z` (may be fixed on integrate: check).
- Pillow's `_imagingft`: `undefined symbol: png_create_read_struct` (amy's static
  `libfreetype.a` needs libpng, which Pillow does not link).
- Matplotlib's `_qhull`: `undefined symbol: __small_sprintf`.
- `amy install python` asks for `nena enable dso sockets` first, in `default`.
- Hosts without CORS headers (github.com, savannah): Matplotlib's Meson wraps cannot fetch their
  sources; the report fetched them through api.github.com and raw.githubusercontent.com.
