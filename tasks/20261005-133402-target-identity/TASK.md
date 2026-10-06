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

## Decision (2026-10-06): the contract

Delegated by the owner ("research them thoroughly and go with the answer that
aligns with the goal of the project").

| Question | Answer |
| --- | --- |
| Macros a program sees | `__dolly__` (1), with the generic `__wasm__`, `__wasm64__` and `__unix__`. Never `__EMSCRIPTEN__`, `__EMSCRIPTEN_PTHREADS__`, `__linux__` or `__wasi__`. `-pthread` adds only `_REENTRANT` |
| The triple Dolly reports | `wasm64-unknown-dolly`: `cc -dumpmachine`, `cc --version`, libcurl's host string |
| The triple given to LLVM | still `wasm64-unknown-emscripten`, as a code-generation parameter of the bootstrap libc, named nowhere a program can test |
| `uname` | `Dolly`, `wasm64`, release `0`, version `dolly-process-0` (unchanged) |
| `config.guess`, `config.sub` | no claim. `config.guess` inside Dolly reads `uname` and fails as an unknown system; a configure run names `--host` itself. Dolly neither answers Linux nor patches `config.sub` |
| CMake | `CMAKE_SYSTEM_NAME=Dolly` (already what the ports pass and what `uname` gives CMake's bootstrap) |
| Error numbers | `enum dolly_process_error` in `process.h`, so the `dolly.process` digest covers them. A libc maps its `errno` to them; the build refuses a bootstrap libc whose numbers differ |
| Sysroot directory names | kept (`/usr/include/wasm64-emscripten` and the archive names): the driver names them, no program does |
| Rust and Zig | `target_os = "emscripten"` and `-target wasm64-emscripten` stay: they name the same libc binding and code generation as LLVM's triple |

Rests on `AGENTS.md`:

- "The compile target for programs and runtimes inside the WebAssembly sandbox
  is the interface. Its Wasm imports, exports, data layout, pointer width,
  filesystem semantics, and lifecycle rules matter more than a high-level
  wrapper API": the predefined macro is the first thing of that interface a
  program reads.
- "Do not claim Linux or AMD64 to pass detection. Use upstream's portable
  paths and explicit unsupported results": `__EMSCRIPTEN__` is the same claim.
  Upstream's Emscripten branches assume a JavaScript host (CPython's
  `os._emscripten_*` and signal clock, SDL's whole Emscripten backend,
  libsodium's `<emscripten.h>` paths), and the ports undid them one by one.
- "The process contract sits below libc. Its current Emscripten musl adapter
  is a bootstrap implementation, not the stable interface": so the libc's
  origin may select code generation inside the toolchain, and may not be the
  name programs compile against, nor own the error numbers of the contract.
- "The core interface must remain small, typed, inspectable, and versioned":
  the error numbers are now hashed with the packets they travel in.
- "no compatibility shims": `__EMSCRIPTEN__` is not kept beside `__dolly__`.

### What the research found

- The sysroot's own headers are ABI-conditional on `__EMSCRIPTEN__`: the
  layout of `struct stat` (`bits/stat.h:8,17,23`), `__PRI64` (`inttypes.h:25`),
  `sigsetjmp` (`setjmp.h:29`), `_POSIX_SPAWN` and `_POSIX_THREADS`
  (`unistd.h:243-264`), C++ `NULL` (eight headers), and in libc++ the thread
  API, the entropy source and `<xlocale.h>` (`__config:143,634`,
  `__locale_dir/locale_base_api.h:131`). 36 uses outside Emscripten's own API
  headers, none of `__EMSCRIPTEN_PTHREADS__`. So a port that passed `-U__EMSCRIPTEN__`
  (`demos/sdl2/Dollyfile-sdl2:19`) compiled against a `struct stat` the linked
  libc does not have; `demos/classicube/Makefile:9` records the same trap.
  Undefining the macro is only correct together with the headers.
- LLVM has no Dolly OS, and the triple selects three things the prebuilt libc,
  libc++ and compiler-rt archives were compiled with: the data layout
  (`f128:64`, `llvm/lib/TargetParser/TargetDataLayout.cpp:525`), `long double`
  alignment 8 and with it `max_align_t` and `malloc`
  (`clang/lib/Basic/Targets/OSTargets.h:1051`), and TLS models other than
  local-exec, which `-fPIC` objects and DSOs use
  (`WebAssemblyISelLowering.cpp:2078`). An unknown OS in the triple changes
  all three. The triple therefore changes only with the libc.
- Error numbers were not neutral: this libc's `ENOTSUP` is 138, not WASI's 58
  (5 uses in kernel C, 23 in the adapter), and the display module returns
  `ENODATA` (116). The other 74 are WASI's.
- Rust's `std` and the `libc` crate bind this libc under
  `target_os = "emscripten"`; a Dolly `target_os` is a port of both and not
  part of this decision.
- No recipe runs `configure`, `config.guess` or `config.sub` inside Dolly.
  The three host-side configure runs (Make, CPython, Emacs) use emcc with
  `--host=wasm64-unknown-emscripten`, which is true of that toolchain, and
  their generated headers hold no `__EMSCRIPTEN__` test.

### Implemented (one seed batch, `core/decisions`)

- `src/compiler.cpp`: cc1 gets `-U__EMSCRIPTEN__ -U__EMSCRIPTEN_PTHREADS__
  -D__dolly__=1`; `-pthread` no longer defines Emscripten's two macros;
  `-dumpmachine` and `--version` report `wasm64-unknown-dolly`.
- `scripts/prepare-kernel-seed.sh`, `scripts/prepare-image-sources.sh`: the
  staged libc and libc++ headers test `__dolly__` wherever upstream tested
  `__EMSCRIPTEN__`, so every branch above stays as the archives were built.
- `include/dolly/process.h`: `enum dolly_process_error`, 76 numbers.
  `scripts/generate-abi-constants.mjs` derives `DOLLY_ERRNO` in
  `src/process-constants.mjs` from it and writes
  `build/process-errno-check.c`, which `scripts/build.sh` compiles against
  the bootstrap libc's `<errno.h>`: 76 static assertions (a number changed by
  hand fails with "static assertion failed ... ENOENT"). The kernel and the
  adapter keep libc's spellings (502 uses in kernel C, 274 in the adapter):
  with the proof they are the contract's numbers, and a rename adds no check.
  `dist/dolly-errno.mjs`, `scripts/browser-errno.c` and
  `scripts/generate-browser-errno.mjs` are gone.
- Core ports use the compiler's macro: `config/make-dolly.patch`,
  `config/samurai-dolly.patch` and `config/git-dolly.patch` test `__dolly__`,
  and the nine `-DDOLLY` in `Dollyfile-system-build` and
  `Dollyfile-system-tools` are gone.
- `test/fixtures/target-identity.c` in the core browser suite: compiled by
  `cc` in the image, it fails to compile under any other platform's macro,
  and at run time checks `stat` against the linked libc and that a missing
  file's `errno` is `DOLLY_PROCESS_ENOENT`.

### What changes for agents and ports

- Test `#ifdef __dolly__` for Dolly. `__EMSCRIPTEN__` is undefined; upstream
  code takes its generic Unix path, which is the porting rule.
- `-DDOLLY` and `-U__EMSCRIPTEN__` in a recipe are leftovers, and `-U` was an
  ABI bug.
- `cc -dumpmachine` prints `wasm64-unknown-dolly`.
- Error numbers come from `<dolly/process.h>`; `<errno.h>` has the same.
- `-pthread` code that tested `__EMSCRIPTEN_PTHREADS__` tests `_REENTRANT`.
- Every executable is restamped: old images, sessions and snapshots are
  refused by the loader.

### Follow-up for the catalog round, by port

Breaks without `__EMSCRIPTEN__` (found by reading the pinned sources; none
of these images was rebuilt here):

| Port | Where | Edit |
| --- | --- | --- |
| python | `demos/python/prepare-cpython.sh:203` (`Include/cpython/pthread_stubs.h`) | the `sed` writes `defined(__wasi__) \|\| defined(__dolly__)` |
| python (libffi) | `include/ffitarget.h:62`, `src/closures.c:34` in `demos/python/prepare-libffi.sh` | both test `__dolly__`; otherwise `FFI_BAD_ABI` in ctypes and duplicate `ffi_closure_alloc`. The same script configures with `--host=wasm64-unknown-linux` (`:52,56`), which the porting rule forbids: use the emcc host triple |
| python | `Modules/socketmodule.h:220`, `Modules/timemodule.c:1548`, `Python/sysmodule.c:3691` | behaviour now follows the generic branch (`SO_REUSEADDR` visible, `time.thread_time` wanted, isolated interpreters reported); keep or patch after the Python suite runs |
| rust | `demos/rust/patti.c:22,281` | `#ifdef __dolly__` (Dolly's own file) |
| local-llm | `ggml/include/ggml.h:237` (`GGML_MEM_ALIGN 8`) | add `\|\| defined(__dolly__)` in `demos/local-llm/prepare-local-llm.sh`; otherwise 16-byte alignment is asserted against an 8-byte `malloc` |
| llvm-tablegen, rust LLVM | `llvm/lib/Support/Unix/Path.inc:522`, `llvm/include/llvm/ADT/bit.h:32` | add `__dolly__` (musl has no `MNT_LOCAL`, the sysroot no `<machine/endian.h>`) |
| zero-ad | `demos/zero-ad/premake-dolly.patch:7` | `#elif defined(__dolly__)` |

Becomes unnecessary and should go in the same round:

- `demos/sdl2/Dollyfile-sdl2:19`: `-U__EMSCRIPTEN__` (and `-DDOLLY`, with
  `sdl2-dolly.patch:53` testing `__dolly__`).
- `demos/python/prepare-cpython.sh:216-221` and the `!defined(DOLLY)` it
  writes into `sysmodule.c`; the `posixmodule.c` hunk of `cpython-dolly.patch`;
  the stubs in `demos/python/cpython-platform.c:16-20`.
- `demos/zero-ad/sodium.patch`: all seven re-tests.
- `demos/neovim/Dollyfile-neovim-build:138`: `MACHINE=wasm64-unknown-emscripten`
  stood in for `cc -dumpmachine`, which now answers (not rebuilt here).
  `demos/emacs/Dollyfile-emacs:54-60` keeps its directory name: it is the
  `--host` Emacs was configured with on the build host.
- Every other `-DDOLLY` and `#ifdef DOLLY`, mechanically as done for the core
  ports (`sed -E '/^\+#\s*(if|ifdef|ifndef|elif)/ s/\bDOLLY\b/__dolly__/g'` on
  the patch, delete the flag): `demos/python/Dollyfile-python` (6),
  `demos/neovim` (patch 3, recipe 1), `demos/emacs` (patch 6,
  `prepare-emacs.sh:66` passes `-D__dolly__=1` to the host emcc instead),
  `demos/cmake/libuv-dolly.mk:7` and `libuv-dolly.patch` (8),
  `demos/zero-ad` (`engine.patch` 36, `openal-dolly.patch` 8,
  `Dollyfile-openal-build:27`, `Dollyfile-zero-ad-deps:101`).
- Unaffected: QuickJS's bare `-DEMSCRIPTEN=1` (Clang never predefined it; it
  selects "no threads, no direct dispatch"), and
  `demos/local-llm/CMakeLists.txt:51`, which defines `__EMSCRIPTEN__` for the
  one upstream file `ggml-webgpu.cpp`; that is the demo's own choice and now
  the only place the name is claimed.

Not decided here, noted: the seed still installs Emscripten's JavaScript-host
headers (`emscripten.h`, `emscripten/`, `SDL/`, `GL/`, `AL/`, `EGL/`, `GLFW/`,
`X11/`, and `/usr/include/fakesdl` on the search path) with nothing behind
them. That is the big-picture review's "presence does not imply function"
and belongs with `20260930-231300-lean-game-images`.

## Verification (2026-10-06, `core/decisions`)

- `npm run build:runtime`: runtime `sha256:d03dc40b…`, image inputs
  `sha256:22d006cac2c84ef3f6b4fc0358c2386f8df7b207a8d3e13a1da0e8a41fac0b81`
  (was `047fc328…`); it compiles the 76 assertions, and a copy with one number
  changed fails ("static assertion failed ... ENOENT").
- `DOLLY_IMAGE_JOBS=1 work/build-slot.sh npm run image -- default`: the ten
  images of the chain rebuilt in 1,001 s; then `amy`, `audio-sdk`, `cc`,
  `core`, `gpu-sdk` and `minimal` in 70 s: all sixteen core images are built
  by the new compiler against the renamed headers, Make, Samurai and Git
  without `-DDOLLY`.
- `node --test test/*.test.mjs`: 275 pass, 0 fail, with the recipes as the
  image build pinned them. The branch restores the 59 recipes whose only
  change was a pin, so the catalog tests report stale pins until the
  integrator re-pins.
- `node test/browser-tests.mjs chromium`: every suite passes except `amy`;
  `process` passed after `test/fixtures/process-descriptors.c` took the
  contract's own medicine (it told Dolly from the native run by
  `__EMSCRIPTEN__`; now `__dolly__`). `node test/browser-tests.mjs firefox`:
  every suite passes except `amy` and one `display` run that timed out
  waiting for the first prompt's selection; `display` alone then passed three
  times of three. The cause of that one timeout was not established.
- `amy` stops at `amy install python` in both browsers: the python package
  is a demo image not rebuilt here, and it needs the edits above first. A
  core suite depends on a demo package; its later cases (`amy cc` in
  `minimal`, the refusal in `system`) did not run.
- The probe `test/fixtures/target-identity.c` runs inside `core` in both
  browsers, with `cc -dumpmachine` and `uname -sm`.

Open until the catalog round has made the follow-up edits: the done-when
line on recipes and patches holds for the core and not yet for the demos.

## Ports carried through (2026-10-06, `core/decisions` after merging `integrate/1005-seed`)

Runtime `sha256:d03dc40b…`, image inputs `sha256:22d006ca…` (unchanged by
the merge). Each port below was rebuilt on the new seed, one image build at a
time through the slot, and its test run. Where upstream offers a switch, the
port uses it instead of a patch.

### python (CPython 3.14, libffi)

- `prepare-cpython.sh`: `pthread_stubs.h` takes libc's types under
  `__dolly__`; the `_Py_thread_local` hook tests `__dolly__`; the four
  `!defined(DOLLY)` re-tests in `sysmodule.c` are gone with the `sed` that
  wrote them. `cpython-dolly.patch` loses its `posixmodule.c` hunk
  (`os._emscripten_*` no longer exists) and tests `__dolly__` twice.
  `cpython-platform.c` keeps only `getentropy`; the Emscripten signal stubs
  had no caller left. Six `-DDOLLY` are gone from `Dollyfile-python`.
- libffi: the host configure names the toolchain that runs it
  (`--host=wasm64-unknown-emscripten`, was `wasm64-unknown-linux`; the
  generated `ffi.h` and `fficonfig.h` are byte-identical). `closures.c`, the
  generic executable-memory allocator, is no longer copied or compiled:
  Dolly's backend provides closures, and upstream skipped the file under
  Emscripten. The staged `ffitarget.h` tests `__dolly__`.
- Beyond the table: the process FFI dispatcher accepts exactly libffi's ABI
  tag 2, `FFI_WASM64_EMSCRIPTEN` (`src/process-ffi.mjs:206`), and
  `ffitarget.h` makes that the default ABI only under Emscripten's macro. The
  first build trapped in the recipe's own libffi check ("process failed:
  unreachable"). The tag is libffi's name for the ABI with structures,
  varargs and closures, so the core is unchanged and the target header tests
  `__dolly__`, as the libc headers do.
- The three behaviours, measured in the rebuilt image
  (`build/core-decisions-evidence/python-probe*.log`):

  | Generic branch | Measured | Settled |
  | --- | --- | --- |
  | `socket` exposes `SO_REUSEADDR`, `SO_REUSEPORT`, `IPPROTO_SCTP` | `socket.socket()` raises `OSError: [Errno 52] Function not implemented` before any option is set | kept: the failure is explicit and no patch is needed |
  | `time.thread_time` is defined | raises `OSError: [Errno 28] Invalid argument`: the kernel refuses `CLOCK_THREAD_CPUTIME_ID`, which libc's `<time.h>` declares | kept, explicit. The attribute now exists and raises where it was absent; hiding it again needs a CPython patch or a libc header without the clock |
  | `sys.implementation.supports_isolated_interpreters` is `True` | upstream's configure leaves `_interpreters` out; built in as a trial, `interpreters.create()` raises `InterpreterError: sub-interpreter creation failed` | reports `False` again by one `sed` (`defined(__wasi__) \|\| defined(__dolly__)`): upstream has no switch, and a capability report must not be wrong |

- Evidence: `python` built in 116 s including the recipe's libffi call and
  closure check; `node demos/run-browser-tests.mjs python` passed in 23.9 s;
  the `amy` case of `test/amy-browser.mjs` (install `python` into `default`,
  run it, save the session) passed in Chrome (9.4 s) and Firefox (10.9 s).

### rust (seed, `patti`, the Rust tools)

- The Rust seed was rebuilt for the new process sysroot
  (`demos/rust/build-rust-toolchain.sh` on a copy of the release tree's
  `build/rustc-port`: "built and validated the complete Rust compiler seed").
  It is compiled on the host by emcc, so its LLVM needs no edit; only the
  in-Dolly LLVM of `llvm-tablegen` does.
- `demos/rust/patti.c:22,281`: `#ifdef __dolly__` selects
  `dolly_spawn_env_cwd`; the native test build keeps `posix_spawn`.
- Evidence: `rust-sdk`, `rust-build`, `rust`, `rust-tools`, `ripgrep`, `fd`
  and `protox` built (ripgrep 101 s, fd 69 s, protox 143 s, all through
  `patti`); `node demos/run-browser-tests.mjs rust` passed in 80.9 s. Its
  tokio fixture needs `python3 demos/codex/prepare-codex-sources.py` once
  (host-side sources only; no Codex image was built).

### emacs

- `emacs-dolly.patch` tests `__dolly__` (6); the configure run that fixes the
  in-Dolly `CFLAGS` no longer passes `-DDOLLY`.
- Evidence: `emacs` built in 53 s and `gnu-emacs` in 20 s;
  `demos/emacs/test/emacs-browser.mjs` passes in Chrome (2 of 2). In Firefox
  it failed 4 of the first 5 runs while CMake was bootstrapping beside it, so
  the old seed was measured too (a detached tree at `46a5776f` with the
  release tree's images): eight interleaved runs each, old seed 5 of 8, new
  seed 4 of 8, with the same two messages on both ("timed out waiting for
  terminal selection publication", "terminal never showed ..."). The flake
  is the open `20261001-095000-terminal-text-flake`, not this change.

### javascript and pi (no edit)

QuickJS's bare `-DEMSCRIPTEN=1` was never the compiler's macro. `javascript`,
`typescript-build`, `pi-build`, `pi-runtime`, `pi-coding-agent` and `pi`
rebuilt unchanged; `node demos/run-browser-tests.mjs javascript` passed in
26.3 s and `pi` in 54.9 s (the agent starts, its tools, `rg` and `fd` run).

### cmake (libuv)

- `demos/cmake/libuv-dolly.patch` tests `__dolly__` (8); `libuv-dolly.mk`
  passes no `-DDOLLY`. CMake itself detects the platform only through
  `CMAKE_SYSTEM_NAME`, which its bootstrap takes from `uname` (`Dolly`).
- Evidence: `cmake-build` bootstrapped and built in 1,627 s, `cmake` in 10 s.
  `node demos/run-browser-tests.mjs cmake` below.

### llvm-tablegen

- LLVM has one platform list without a portable branch,
  `is_local_impl` (`llvm/lib/Support/Unix/Path.inc:522`): its generic
  `MNT_LOCAL` does not exist in musl. The hunk adding `__dolly__` joins
  `demos/llvm/llvm-host-triple.patch`. `ADT/bit.h` lists platforms for
  `<endian.h>` and otherwise wants `BYTE_ORDER`, so the recipe passes
  `-include endian.h` instead of a second hunk. `LLVM_HOST_TRIPLE` stays
  `wasm64-unknown-emscripten`: LLVM's own vocabulary, as in the seed.
- Evidence: `llvm-tablegen` configured and built its TableGen tools and
  targets in 761 s.

### local-llm (one line)

- `demos/local-llm/prepare-local-llm.sh`: one `sed` on the extracted
  `ggml/include/ggml.h` adds `|| defined(__dolly__)` to the branch that sets
  `GGML_MEM_ALIGN` to 8 for a `max_align_t` of 8, which Dolly's ABI shares
  with Emscripten's. Nothing else in `demos/local-llm/` is touched, so the
  two branches changing it on the old seed rebase on one inserted line.
- Evidence: `llama-build` (llama, ggml, ggml-webgpu) built in 263 s,
  `local-llm-build` in 27 s. Not run: the runner needs `pi-local`, which the
  catalog round rebuilds.

### sdl2

- `Dollyfile-sdl2` passes no `-DDOLLY -U__EMSCRIPTEN__`: SDL is now built
  against the same `struct stat` it links. `SDL_dynapi.h` refuses
  `SDL_DYNAMIC_API` from the command line ("Nope, you have to edit this file to
  force this off"), so the hunk stays and tests `__dolly__`. The stale
  comment about the stat trap in `demos/classicube/Makefile` is gone.
- Evidence: `sdl2` built in 858 s; `node demos/run-browser-tests.mjs sdl2`
  passed in 6.3 s.

### neovim

- `neovim-dolly.patch` tests `__dolly__` (3); `Dollyfile-neovim-build` passes
  no `-DDOLLY` and no longer overrides tree-sitter's `MACHINE`, whose
  Makefile asks `$(CC) -dumpmachine`.
- Evidence: `neovim-build` built in 514 s (tree-sitter, Lua, luv, utf8proc,
  parsers, Neovim), `nvim` and `neovim` after it;
  `node demos/run-browser-tests.mjs neovim` passed twice after one failure
  on the selection-publication timeout at a load average above 100.

### zero-ad (deps and engine; `zero-ad` itself is the catalog round's)

- `premake-dolly.patch` detects the host by `__dolly__`; the premake system
  name stays `emscripten` (`--os=emscripten`, `os.istarget("emscripten")` in
  `engine.patch`): premake has no `dolly` system and adding one is a larger
  patch, so 0 A.D. keeps naming premake's nearest system. `engine.patch` (36)
  and `openal-dolly.patch` (8) test `__dolly__`, and premake no longer
  defines `DOLLY`. `sodium.patch` is deleted (its deletion was staged into
  the python commit by mistake): libsodium's `randombytes.c` takes its
  generic path and `core.c` its atomic lock. `-DDOLLY` is gone from the
  libsodium and OpenAL flags.
- Beyond the table: ICU. Its bundled double-conversion lists architectures
  and knows `__wasm32__` but not `__wasm64__` ("Target architecture was not
  detected"): the recipe adds `__wasm64__` to that line. `unicode/platform.h`
  falls to `U_PF_UNKNOWN`, whose one consequence is the charset default,
  and the header's own hook `U_CHARSET_IS_UTF8` is now passed as 1.
- Evidence: `openal-build` 154 s, `zero-ad-deps` 268 s, `zero-ad-engine`
  381 s (premake, pyrogenesis with SpiderMonkey). `0ad-spidermonkey-browser`,
  `0ad-openal-browser` and `0ad-enet-browser` passed.

### amy

`test/amy-browser.mjs`: `amy` passes in Chrome and Firefox; `amy programs`
installs `cmake`, `sdl2` (CMake finds it) and `rust` and runs each, then
stops at `codex-cli`, a Codex image this round does not build. A copy of the
suite without that row (`build/core-decisions-evidence/amy-no-codex.mjs`)
passes all four cases in both browsers.

### Not built here, for the catalog round to watch

- `codex-build`, `codex`, `codex-cli` (70 minutes; the Rust seed and `patti`
  are proven by the Rust tools), `dollyfile-studio`, `pi-local` and the model
  packages (`qwen3.5-800m`, `qwen3.5-2b`, `minicpm5-2b`), `zero-ad` (the
  engine and its dependencies built and their three tests passed).
- `classicube`, `classicube-build`, `bhop`, `rts-arena`, `rts-build`,
  `slopyard`, `gamedev-sdk`, `gpu-fluid`: no identity edit; they build on
  QuickJS's bare `-DEMSCRIPTEN=1`, SDL2 and the game SDKs rebuilt here.
