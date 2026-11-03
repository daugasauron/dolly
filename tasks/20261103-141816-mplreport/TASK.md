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

## State (2026-11-03 23:45, branch `demo/pydata`, by the pydata agent)

Checked against `demo/pydata` (integrate's head of the evening plus the pydata work), where
python-data builds Matplotlib 3.10.9 and its figures render ([pydata](../20261103-110906-pydata/TASK.md)).

Blocking:

1. C++ exceptions in shared libraries: fixed in the loader, `4e992e97a` (page code, not an
   image input). Both sides already agree that `__wasm_lpad_context` is thread-local: every
   Dolly object is compiled with atomics and bulk memory (`compiler.cpp`), shared ones too, so
   LLVM's WasmEHPrepare makes it thread-local in the library as in libunwind; the report's guess
   that `-shared` objects are compiled without threads does not hold. A thread-local reached
   from position-independent code is a `GOT.mem` import whose value the dynamic linker must make
   the thread's address, and `host/dso/process.mjs` gave it the exported value, the offset (72).
   It now gives a `GOT.mem` import of a process C++ `thread_local` the address its `_ZTW`
   wrapper returns, called in the Worker that instantiates the library (each instance has GOT
   globals of its own, so this holds for threads too). `test/fixtures/cpp-sdk.mjs`'s library
   now throws and catches inside itself (`cpp_sdk_check`: `std::exception`, `out_of_range`,
  `int`, `f751f3480`);
   with the old loader the host dies of the uncaught exception. `dso-browser.mjs` passes in
   Chromium and Firefox; in a session the report's matrix (`int`, the same type, a base, a
   type of the library) returns all four from a `-shared` pybind11 module, and Matplotlib
   imports and draws. Left: a C `_Thread_local` of the process has no wrapper, and the loader
   cannot tell its offset from an address; the exact fix is the compiler recording which
   exports are thread-local (a seed change), not needed by anything built tonight.
2. Thread pools: `c085280fb` makes `ThreadPoolExecutor.submit()` run the item at once, in a
   worker context of its own, on Dolly, since `Thread.start()` runs its target serially there.
   Measured: Pillow builds in 24 s (it hung), the python recipe checks three submitted items.
   Making `start()` fail instead turns Pillow's build into a failure, not a fallback:
   setuptools' `build_ext` has no serial path once `parallel` is set, and the patch's serial
   `start()` serves callers that drain spooled subprocess output. `multiprocessing.pool.
   ThreadPool` still waits for ever; real threads are `20261103-134653-pythreads`.
   Done on `demo/python-threads` (2026-11-04): CPython runs on threads@0 and the stopgap is
   gone; the python recipe checks three pool workers meeting at a barrier.

Frictions:

- Python's `sysconfig`: fixed at its cause, `6a0b03b77` (`prepare-cpython.sh` drops
  Emscripten's `-s` settings and names `c++ -shared`; the check module is built from
  sysconfig's flags as setuptools builds one).
- `-flto`: Dolly links no LTO bitcode; Matplotlib's builds pass `-Db_lto=false`. Supporting it
  would mean `cc -flto` emitting bitcode and the driver running wasm-ld's LTO (a seed change);
  no image needs it.
- `-pthread -shared`: a library cannot link the thread runtime while threads@0 refuses DSOs;
  only Matplotlib 3.11's HarfBuzz asks (Meson grants `threads` everywhere). Done on
  `demo/python-threads`: `cc` links `-pthread -shared` and `-pthread -rdynamic`, and a threaded
  host places a library in every thread.
- `patch -l -f`: fixed on `demo/pydata-seed` (`src/commands/patch.c`, a seed input; a native
  test that failed before). Matplotlib 3.10.9 needs no diff files, so python-data does not wait
  for it.
- `tar`: fixed after v0.1.4, on this branch already: `dbf389652` and `705de0883` (2026-11-02)
  read pax and GNU long-name headers, and `src/commands/tar.c` takes `-z` (and `--gzip`) through
  gzip. The report's session ran the published v0.1.4.
- Pillow's `_imagingft` (`png_create_read_struct`): met here too. Pillow links `-lfreetype`
  alone and the freetype package's static library needs libpng and zlib (its `freetype2.pc`
  requires both); python-data-build passes them in `LDFLAGS`, and the demo test draws text with
  Pillow's FreeType font.
- `_qhull`'s `__small_sprintf`: met here too. LLVM rewrites `sprintf` calls without a
  floating-point conversion to Emscripten libc's `__small_sprintf`; a static program links it,
  but a `-rdynamic` host exports only `config/process-libc-provider.symbols`'s reserved names
  and `__small_*` are not among them. Fixed on `demo/pydata-seed` (the three `__small_` names
  LLVM emits added to the list; the process sysroot is a seed input). Verified in a session: a
  library calling `__small_sprintf` fails to load in a host linked with the old list and runs
  in one linked with the new; on the seed branch's images, built here, `matplotlib.tri`
  triangulates and `tricontourf` draws. Until a round builds it, they fail to import `_qhull`
  in python-data.
- `amy install python` asking for `nena enable dso sockets` in `default`: on this branch
  `default` declares both modules and python's demo test ("python on default") installs it
  without nena, in Chromium and Firefox. The published v0.1.4 was not checked.
- Hosts without CORS headers: python-data-build stages every source on the site (pins in
  `config/source-pins.sh`); a session building Matplotlib 3.11 from PyPI still meets them.
  That is the HTTP policy's and the relays' domain (`docs/http.md`), not changed here.
