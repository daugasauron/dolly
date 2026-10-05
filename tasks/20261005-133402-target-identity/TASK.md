# Give the compile target its own identity: triple, macro and errno numbers in the contract

- STATUS: OPEN
- PRIORITY: 300
- TAGS: core,abi,toolchain,design

From the big-picture review (`20261005-131642-big-picture`). `AGENTS.md`: "The
compile target for programs and runtimes inside the WebAssembly sandbox is the
interface", and the Emscripten musl adapter "is a bootstrap implementation,
not the stable interface". The process contract is Dolly's own (one import,
56 operations, its own flag and signal enums). The target that programs
compile against still calls itself Emscripten, and every new port is written
against that name.

## Evidence (`integrate/1005` at `c5b9e132`)

- `src/compiler.cpp:473`: the in-Dolly `cc` compiles for
  `wasm64-unknown-emscripten`, so `__EMSCRIPTEN__` is predefined in every
  program built inside Dolly. Lines 535-539 search `/usr/include/fakesdl`,
  `/usr/include/compat` and `/usr/include/wasm64-emscripten`; line 492 adds
  `-D__EMSCRIPTEN_PTHREADS__=1`; lines 516-521 rename `dlopen`, `dlsym`,
  `dlerror` and `dlclose` with `-D` because the libc carries dead stubs.
- Upstream sources detect Emscripten and choose paths that expect a JavaScript
  host, and the ports undo it one by one, each with a private spelling:
  `demos/sdl2/Dollyfile-sdl2-build:22` (`-DDOLLY -U__EMSCRIPTEN__`),
  `demos/python/prepare-cpython.sh:203,220`
  (`defined(__EMSCRIPTEN__) && !defined(DOLLY)`), `demos/classicube/Makefile:9`
  ("the bootstrap libc stat layout depends on `__EMSCRIPTEN__`"),
  `demos/local-llm/CMakeLists.txt:51` (defines `__EMSCRIPTEN__=1` by hand),
  16 uses in the 0 A.D. patches, and `-DDOLLY` in the Python, Neovim, Emacs
  and OpenAL recipes. No compiler-defined Dolly macro exists.
- Error numbers are outside the contract. `include/dolly/process.h:25` says a
  negative result is "a negated errno value of the target libc";
  `dist/dolly-errno.mjs` is generated from the pinned `<errno.h>`
  (`scripts/build.sh:114-117`). The `dolly.process` digest covers `process.h`
  and the typed import, so a libc with other numbers keeps the same stamp.
- `uname` already answers `Dolly` / `wasm64` / `dolly-process-0`
  (`src/process/libc-adapter.c:44-47`), so the running system and the compiler
  disagree about the platform's name.
- `AGENTS.md`'s porting rule forbids claiming Linux or AMD64 to pass
  detection. Claiming Emscripten has the same effect: upstream selects code
  for a platform Dolly is not.

## Decide (owner: this is the API's shape)

1. The identity: a compiler-defined macro (`__dolly__`), whether
   `__EMSCRIPTEN__` stays defined, and the triple spelling the driver reports.
2. Whether error numbers become constants of `process.h` (covered by the
   digest) with libc mapping to them, or stay libc's by declaration.
3. Whether the sysroot keeps Emscripten's directory names.

Recommendation: define `__dolly__`, stop defining `__EMSCRIPTEN__` for
programs (the libc's own headers get what they need from the sysroot), and
put the error numbers in `process.h`. Every image, the Rust seed and the
0 A.D. engine rebuild, so take it in the same seed round as `input@0`
(`20261002-072000-input-host-module`): one catalog rebuild instead of two.
Each week of new ports raises the price.

## Done when

- The decision and its reasons are recorded here.
- A program compiled by `cc` inside Dolly sees the decided macros, checked by
  a browser test that compiles and runs a probe.
- No recipe or patch in the tree undefines or re-tests `__EMSCRIPTEN__` to
  reach portable code; the ports' private `-DDOLLY` spellings are gone or are
  the compiler's own macro.
- If error numbers move into `process.h`: the kernel and the adapter use those
  constants and a changed number changes the `dolly.process` digest.
