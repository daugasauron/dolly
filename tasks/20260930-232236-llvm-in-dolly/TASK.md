# Build LLVM, Clang and LLD inside Dolly

- STATUS: OPEN
- PRIORITY: 345
- TAGS: toolchain,bootstrap,llvm,core

Owner (2026-10-07): "this is very high priority." Worked on branch
`core/llvm-in-dolly` (worktree `work/llvm`), in parallel with release 0.1.0.

## Remaining (2026-10-08)

Built inside Dolly, on `core/llvm-in-dolly` (`demos/llvm`, sections below):
the TableGen tools; the compiler's whole closure, 2,559 units in 103
archives, at four jobs in 42 minutes; the compiler linked from them, whose
output is the seed compiler's byte for byte on a sample; and, on demand, a
second stage built by that compiler, identical to the first in every archive,
the compiler and the TableGen tools (a third was run once). The first two
clauses of "Done when" hold. In the catalog: `llvm-tablegen`, `llvm-build`,
`llvm-cc` and the package `llvm`; the libraries are `core/llvm-runtimes`'
part, below. Left:

- **Replacing the host-built seed** (the third clause) is a later decision.
  The compiler here is a second one beside the seed's. Open: its size (127 MB
  against the seed's 78 MB: Dolly has no binaryen; about 96 MB without the
  name section) and the libc, which the host still builds.
- **The browser stack** has no general fix. The JSPI entry doubles Chrome's;
  `MSP430.cpp` fits with a margin of 635 in 760 and `SemaARM.cpp` only with
  LLVM's warnings off. A process primitive that continues on a fresh stack
  is an ABI decision for the owner; both browsers can provide one without a
  suspending import (measured, see "The two stack overflows").
- **Jobs**: four, because a CMake job is three processes and the supervisor
  admits 32 (`20260930-231102-parallel-rust` decided a memory budget instead).
- **Each stage extracts the sources and runs TableGen again**, because
  snapshots keep no file times (about 4 of `llvm-build`'s 44 minutes).
- The closure was built in Chrome only; Firefox compiles the two deepest
  units but was not given the whole build.

The keystone for the bootstrap goals: a self-hosted rustc
(`20260930-231100-self-host-rust`), an LLVM-enabled Zig, and a compiler seed
reproducible from inside Dolly all need LLVM built by Dolly's own `cc`. Today
the seed compiler (Clang/LLD 24, one 75 MiB executable) is built on the host by
`scripts/build-toolchain.sh` (native tblgen at `:83`, flags at `:96-97`).
Source: Fable review, 2026-10-01.

## Measure first

- tblgen built by `cc` inside Dolly, then run on LLVM's `.td` files.
- The three heaviest Clang translation units: wall time and peak memory
  (the Zig spike saw 2-3.3 GB per large compile).
- The LLD link of the compiler executable (inputs are copied by `mmap`, so
  memory roughly doubles).
- The translation-unit count, to extrapolate the serial and `-j N` total.

## Risks

- 8 GiB per process and per kernel memory; the build tree and sources
  (3-4 GB) live in WasmFS inside that memory. Stage builds as images that keep
  only archives (the 2 GiB import limit forbids retaining trees).
- The ~0.5 MB Worker stack (it stopped the wasm2c route for zig1).
- Parallel jobs: Make `-jN` works (`20260930-231102-parallel-rust`), but each
  `cc` launch spends ~80 ms serially, a floor of N x 80 ms for N TUs.
- Two LLVMs today: 24 for the seed (`config/source-pins.sh`), 22 for rustc
  (`demos/rust/toolchain/bootstrap-sources.json`); settle one before building.

## Done when

- An image builds LLVM, Clang and LLD from pinned sources with only in-sandbox
  tools; a stage built by that compiler reproduces it byte for byte (stage 2
  equals stage 3); the result can replace the host-built seed.

## Measured (2026-10-01)

Method: `default` image in headless Chrome 151 (worktree of `takeover-20260930`),
pinned `.cache/llvm-project` plus the seed's emcmake configure and generated
headers (`.cache/llvm-wasm`) staged into WasmFS with curl + tar, commands taken
from the seed's `compile_commands.json` and run with the in-sandbox `c++`.
Peak memory is the process's Wasm memory size; host numbers are the pinned
emsdk Clang with the same flags. The 16-core host ran other builds (load 15-21),
which inflates both sides alike. Scratch scripts were not kept.

- **tblgen works.** The 306 TUs behind `llvm-min-tblgen`, `llvm-tblgen` and
  `clang-tblgen` (Support, Demangle, TableGen, CodeGenTypes, TableGen
  Basic/Common, RISCVVIntrinsicUtils) compile at `-O3` in 752 s serial
  (max 285 MB, median 83 MB); `ar` and the three links take under 0.3 s each.
  All 208 tablegen runs of the seed build plus GenVT through `llvm-min-tblgen`
  give byte-identical outputs (`cmp`) in 50 s; the heaviest,
  `AMDGPUTargetParserDef.inc`, takes 15.6 s and 821 MB.
- **Heaviest TUs** (ranked by host CPU over the whole closure):

  | TU | Dolly `-O2` | Dolly `-O3` | Wasm memory | host `-O3` CPU, RSS |
  | --- | --- | --- | --- | --- |
  | clang `SemaExpr.cpp` | 45.4 s | 44.0 s | 715 MB | 20.5 s, 766 MB |
  | clang `SemaOpenMP.cpp` | 39.1 s | 42.1 s | 758 MB | 19.1 s, 785 MB |
  | clang `SemaConcept.cpp` | 27.0 s | 26.9 s | 696 MB | 13.0 s, 721 MB |
  | llvm `SLPVectorizer.cpp` | | 61.0 s | 803 MB | 24.3 s, 846 MB |
  | llvm `PassBuilder.cpp` | | 47.9 s | 898 MB | 18.6 s, 920 MB |

  The whole tab (kernel, 440 MB of staged files, JIT code) peaked at 2.1-2.7 GB.
- **LLD link of the compiler, measured:** Dolly's `c++` linking the driver
  objects with the seed's 103 archives (2,559 members, 223 MB) takes 1.8 s and
  884 MB (host `wasm-ld --threads=1`: 1.2 s, 806 MB RSS). The output has the
  host `wasm-ld` output's size, 127,082,816 bytes (code 87.7 MB, data 8.3 MB,
  name section 30.8 MB); the seed is 78 MB only because emcc's binaryen pass
  shrinks code to 70.3 MB and drops names. The Dolly-linked compiler runs, and
  its object for `ItaniumDemangle.cpp` is byte-identical to the seed's.
- **Counts:** the seed configuration emits 3,632 compile commands; the compiler
  closure is 2,559 TUs (LLVM 1,641, Clang 891, LLD 27) in 103 archives, plus
  122 TUs for the three tablegen tools: 2,681 TUs and 208 tablegen runs. Their
  host CPU without PCH is 6,305 s. Dolly/host is 2.14 over 311 paired TUs
  (fit: 2.17 x host CPU), so a serial build is about 3.8 h; with ideal job slots
  `-j4` about 57 min, `-j8` 28 min, `-j16` 14 min. The longest TU (61 s) and the
  tablegen stage (306 TUs, then 50 s of runs) do not bound that. Per compile,
  host RSS is 225 MB median, 620 MB at p99, 920 MB max, and Dolly's Wasm memory
  stays below that: eight concurrent compiles typically need under 3 GB, at
  most 7.2 GB if the heaviest coincide.
- **WasmFS:** a full tree is about 0.9 GB (sources without tests or docs 0.3 GB,
  generated 45 MB, objects 203 MB, archives 223 MB, compiler 127 MB), not 3-4 GB;
  the archives fit a 2 GiB image import.

Failures found, each to fix before an image build:

- The driver rejects flags that LLVM's CMake emits: `-fno-common` (all 1,115
  Clang TUs; the observed failure), `-fPIE` (423 tool TUs, all 68 tablegen-tool
  TUs), `-ffunction-sections`, `-fdata-sections`, `-funwind-tables`, `-Xclang`
  (nearly every TU) and `-ftrapping-math` (one). The measurement dropped them.
- The seed configuration uses precompiled headers (2,677 of 2,681 TUs pass
  `-Xclang -include-pch`); Dolly has no PCH path, so build with
  `LLVM_ENABLE_PRECOMPILED_HEADERS=OFF`. All numbers above are without PCH.
- `APFloat.cpp` includes `shared/math.h` from `llvm-project/libc`; the staged
  sources need `libc/{shared,src/__support,hdr,include}` (25 MB).
- Linking the compiler fails with the driver's fixed `--initial-memory=16777216`:
  `wasm-ld: error: initial memory too small, 17225760 bytes needed` (8 MiB stack
  plus data); `-Wl,--initial-memory=33554432`, the seed's value, links.
- Dolly has no binaryen, so a self-built compiler is 127 MB instead of 78 MB.
  Stage 2 against stage 3 is unaffected; replacing the seed must accept that or
  drop the name section (about 96 MB).
- Not tested: configuring LLVM with CMake inside Dolly; every flag and
  `llvm/Config/*.h` above came from the host's emcmake configure.

Not hit: the Worker stack (no overflow in 314 compiles, 209 tablegen runs and
four links), the 8 GiB cap (0.9 GB per process at most) and WasmFS pressure.

Next: let the driver accept `-fno-common`, `-fPIE` and the section flags, and
link with 32 MiB of initial memory; configure the pinned tree with CMake in the
`cmake-build` image (PCH off) and compare its config headers with the seed's;
then a build-only image that builds the tablegen tools (about 13 min serial),
runs tablegen and keeps only archives. The 2,559-TU stage waits for Make or
Ninja job slots (`20260930-231102-parallel-rust`): about 3.6 h serial, 28 min at
`-j8`.

## Driver flags (2026-10-01, `work/fixes-build`)

`cc` accepts `-fno-common`, `-fPIE`, `-ffunction-sections`, `-fdata-sections`,
`-funwind-tables`, `-ftrapping-math` and `-Xclang` (checked in
`test/cpp-browser.mjs`, Chrome and Firefox). The 16 MiB initial memory is the
process ABI's floor (`src/process-abi.mjs`), so the compiler link keeps
passing `-Wl,--initial-memory=33554432`, as the seed build does.

## Configure and TableGen inside Dolly (2026-10-01, `work/llvm-stage1`)

`demos/llvm` adds the build-only image `llvm-tablegen`: `FROM cmake-build`,
Python copied from `python-runtime`, the seed's verified checkout staged without
tests or docs (15,743 files, 63 MB gzip, 11-16 s to extract). CMake configures
the tree as `scripts/build-toolchain.sh` does (PCH off), Make builds the three
TableGen tools and runs the 13 TableGen targets of the compiler closure; the
image keeps the tools and `/usr/share/llvm-tablegen` (configured headers and
TableGen outputs, 228 files, 35 MB). It is a demo, not core: CMake and CPython
are demos and the core never uses one.

Method: image builds in headless Chrome 151 on the 16-core host (load 12-16
from other agents' builds); wall times from Dolly's `time` in the image log;
memory is the whole browser's PSS sampled every 2 s.

Configure: 62-75 s configuring plus 12-16 s generating (74-90 s with
`time`). What it needed:

- Python 3: `find_package(Python3 REQUIRED)` (`llvm/CMakeLists.txt:1077`)
  runs even with tests off. `COPY FROM python-runtime` of `/usr/bin/python`
  and `/usr/lib/python3.14` suffices (Python 3.14.7 found).
- `config-ix.cmake:533` always runs `sh cmake/config.guess`, even when
  `LLVM_HOST_TRIPLE` is given. Slop stops on it (`trap: command not found`,
  `unterminated arithmetic expansion`), and `config.guess` has no entry for
  `uname -s` = `Dolly` anyway. `demos/llvm/llvm-host-triple.patch` infers the
  triple only when none is given (upstreamable); Dolly's `patch` applies it.
- PCH is `CMAKE_DISABLE_PRECOMPILE_HEADERS=ON` in LLVM 24;
  `LLVM_ENABLE_PRECOMPILED_HEADERS` (above) is not read.
- LLD always adds `lld/docs` and LLVM `utils/mlgo-utils`; both are staged.

Generated configuration against the seed's emcmake tree (`.cache/llvm-wasm`):
`llvm-config.h`, `abi-breaking.h`, `Targets.h`, the six target `.def` files,
`Extension.def` and Clang's `config.h` are identical, as is every other
`HAVE_*`, `*_SUPPORTS_*` and linker check in `CMakeCache.txt`. `config.h`
differed in six macros: `HAVE_GETPAGESIZE`, `HAVE_SBRK`, `HAVE_SETENV`,
`HAVE_SIGALTSTACK`, `HAVE_STRERROR_R` and `HAVE__UNWIND_BACKTRACE` were
undefined. The first five are `cc`'s strict `-std=c17` default hiding POSIX
from C probes (`20260930-100000-audit-41`); the recipe passes
`-DCMAKE_C_FLAGS=-std=gnu17`, the dialect the seed's C got from Clang.
With it the five match the seed. `_Unwind_Backtrace` stays undefined: Dolly's
process link has none, nor does Emscripten's `libunwind-mt-wasmexcept.a`; why
emcc's probe linked is not established.
`BuildVariables.inc` (llvm-config only) differs in its source and build paths.
`VCSRevision.h` and the Clang/LLD `VCSVersion.inc` are build-time outputs and
the staged tree has no `.git`: the compiler stage needs
`-DLLVM_FORCE_VC_REVISION=<pin> -DLLVM_FORCE_VC_REPOSITORY=<url>` to embed the
seed's version strings.

TableGen tools, the same 306 TUs at `-O3` through CMake's Makefiles:

| `make` | wall | build only | peak PSS |
| --- | --- | --- | --- |
| `-j1` | 524 s | ~502 s | 3.6 GiB |
| `-j4` | 208 s | 208 s | 4.1 GiB |
| `-j6` | 165 s | ~138 s | 4.5 GiB |
| `-j8` | fails after 8 s | | |

The four rows are one image build in that order (`-j8` first, then `-j4`,
`-j6`, `-j1`); "build only" subtracts a CMake re-configure (22-27 s) that
deleting `bin/` between the runs caused. The committed recipe's own build, at
host load 3-6, took 155 s at `-j4`, its TableGen step 155 s and the whole
image 416 s; its peak, 5.4 GiB, came while capturing the snapshot.
Configure peaks at 3.3 GiB.

`-j8` fails with `slop: /bin/c++: spawn failed: Resource temporarily
unavailable`. Every CMake compile rule is `cd DIR && c++ ...`, so each job
holds Slop, the `c++` proxy and the compiler (a link also `cmake -E
cmake_link_script`), plus one sub-make per target in progress: more than the 32
process Workers (`src/process-supervisor.mjs:23`). The recipe uses `-j4`.

TableGen runs: the 13 targets take 155-163 s at `-j4` (4.8 GiB peak), against 50 s
for the same runs invoked directly (above). The top-level Makefile is
`.NOTPARALLEL`, so the goals run one after another, each with its own
`cmake --check-build-system`, and every custom target adds a sub-make and a
Slop. Every TableGen output, 197 `.inc` files among them, is byte-identical to
the seed's, and none of the seed's is missing (it has only the VCS files and
Clang's copied resource headers besides).

The snapshot is 322 MB (248 MB of it `cmake-build`). The committed recipe's
`config.h` differs from the seed's only in `HAVE__UNWIND_BACKTRACE`, and its
TableGen outputs match as above.

Found for the next stage:

- Snapshots record no mtimes and Dolly's `tar` sets none, so a configured Make
  tree cannot continue in a later image: restored outputs and re-extracted
  sources get new times. Either build the whole compiler in one image or let
  each stage re-configure (90 s) with `LLVM_TABLEGEN`/`CLANG_TABLEGEN` pointing
  at the tools kept here, as the seed uses native ones.
- The process cap bounds `make -j` for CMake projects (each job is at least
  three processes): `-j6` passed the tools once, but on the libraries
  (`make -k -j6 LLVMAnalysis`, scratch image) it failed within seconds with
  `slop: /usr/bin/cmake: spawn failed` in `intrinsics_gen`'s depend step and
  `VCSRevision.h`. `20260930-231102-parallel-rust` proposes a memory budget
  instead of the count.

Library stage, probed in a scratch image `FROM llvm-tablegen`: configured as
above plus `LLVM_TABLEGEN`/`CLANG_TABLEGEN` set to the kept tools and
`LLVM_FORCE_VC_REVISION`/`LLVM_FORCE_VC_REPOSITORY` (83 s),
`make -k -j4 LLVMAnalysis` compiled its whole closure, 807 TUs from Support
to Analysis, without an error in 470 s (4.4 GiB peak, host load 6-8).

The same probe for the whole closure (`make -k -j4 clangFrontendTool
clangCodeGen lldWasm LLVMWebAssemblyCodeGen`) ran 25 minutes (stopped for
time, 214 targets done) and hit the Worker stack risk: `dolly: process N
Worker failed while running: Maximum call stack size exceeded`, three tries
each, for Clang's `lib/Driver/ToolChains/MSP430.cpp` and
`lib/Sema/SemaARM.cpp`. MSP430.cpp chains 635 `StringSwitch::Case` calls from
`MSP430Target.def`, presumably one recursion level each; SemaARM's deep
construct is not yet located.
The host compiles both natively; in Dolly the limit is the browser's native
stack for a Worker running Wasm, which a page cannot raise. No other TU failed
in that time; peak 5.7 GiB.

Next: measure what bounds the recursion (which compiler phase, the depth per
`Case`, whether V8's baseline or optimized frames run), then decide between
an upstream source change for such chains and a compiler process that needs
less native stack. Then the full closure at `-j4`, keep the 103 archives, link
the compiler and compare it with the seed's link.

## The two stack overflows (2026-10-07, `core/llvm-in-dolly`)

Method: the `llvm-tablegen` image opened with a terminal in headless Chrome
151.0.7922.71 (and Firefox 155 where named), the staged LLVM tree extracted to
`/tmp/llvm-project`, the seed compiler (image inputs `c62b2710…`) run as `c++`
with the flags of the seed's `compile_commands.json` (no PCH). Stacks are V8's,
with `Error.stackTraceLimit` raised in the Worker and names taken from a
relink of the seed with `--profiling-funcs` (same code section, 70,301,918
bytes). Scratch harness and logs: `build/llvm-evidence/stack/` (not kept).

What bounds the recursion is the browser's stack for Wasm frames, not the
8 MiB stack in the process's memory:

| | depth of a one-local recursive function | stack |
| --- | --- | --- |
| Chrome Worker, entered directly | 7,975 Liftoff frames of 64 B | 500 KB (Blink's fixed Worker limit) |
| Chrome Worker, entered through `WebAssembly.promising` | 15,103 | about 950 KB |
| Firefox 155 Worker, either way | 162,424 / 163,819 | not the bound here |

`--js-flags=--stack-size=3000` and `--wasm-stack-switching-stack-size=4000`
change neither Chrome number by more than 5%: a page gets these two stacks
and no larger one.

- **`MSP430.cpp`** (`clang/lib/Driver/ToolChains`): 635 chained
  `StringSwitch::Case` calls. Clang's CodeGen recurses once per call, first in
  `VarBypassDetector::BuildScopeInformation` (4 Wasm frames per AST level,
  1,214 levels at the overflow, 105 B per frame) and then in `EmitCallExpr` >
  `EmitCXXMemberOrOperatorMemberCallExpr` > `EmitLValue` (7 frames per call,
  177-187 B each in tiered-up code: 1.3 KB per call, so 500 KB end at call
  390-410 of 635). Three of the seven frames are Clang's own
  `runWithSufficientStackSpace` guard, which only warns when LLVM is built
  without threads and measures the stack in Wasm memory in any case.
- **`SemaARM.cpp`**: `arm_sve_streaming_attrs.inc` is one run of 6,020 `case`
  labels, a `CaseStmt` nest 6,020 deep. The overflow is `-Wimplicit-fallthrough`
  alone: its `FallthroughMapper` is a `RecursiveASTVisitor` (4 frames of 60 B
  per label, the smallest frames there are), so it needs 1.44 MB. With LLVM's
  whole warning set except that flag, and with no warning set, the file
  compiles; with only that flag added it fails (4 variants, one run each).
  It overflowed at label 2,094 directly and, through JSPI, at 3,303 on the
  first attempt and 3,993-4,002 on later ones.

Fix for the first (commit `528f9883`): the process Worker enters `_start` and
`dolly_thread_start` through `WebAssembly.promising` where it exists. It is
not in the image inputs, so no image rebuilds. Chain capacity (a function
returning N chained member calls, `-O3`, three rounds in one browser):

| entry | compiles | fails |
| --- | --- | --- |
| direct | 400 | 440 |
| JSPI, compiler not yet optimized by V8 | 760 | 780 |
| JSPI, third round | 800 (largest tried) | |

`MSP430.cpp` then compiled 12 times of 12 in one browser (6.1 s, then
3.2-3.3 s) and 3 of 3 with LLVM's full flags; object 108,376 bytes. The core,
process, threads, dso and cpp browser suites pass in Chrome and Firefox;
`test/cpp-browser.mjs` compiles a 640-call chain, which fails in Chrome
without the change.

Fix for the second: none in the compiler. 1.44 MB is more than either Chrome
stack and the visitor has no guard to hop from, so the LLVM recipe configures
with `LLVM_ENABLE_WARNINGS=OFF` (upstream's switch for the `-Wall …
-Wimplicit-fallthrough …` block); diagnostics do not change objects.
`SemaARM.cpp` then compiles (4 of 4, 10.5-13.5 s, 303,726 bytes).

Limits that remain, recorded rather than hidden:

- The margin for `MSP430.cpp` is 635 of about 770. With `--js-flags=--no-liftoff`
  (TurboFan for every function, no call feedback) frames grow to 234 B and it
  overflows at call 590 even through JSPI; `--liftoff-only` passes. Chrome's
  ordinary tiering stayed inside the stack in every run.
- A real fix needs more than one browser stack. Clang's guard can continue on
  a new stack (`llvm::runOnNewStack`), but only when LLVM is built with
  threads, it decides from the stack in Wasm memory, and visitors such as
  `FallthroughMapper` have no guard at all. A process primitive that runs a
  function on a fresh stack (JSPI gives one per `promising` call) would serve
  Clang, rustc's `stacker` and the zig1 route; that is an ABI decision and was
  not taken here.
- Measured for that decision (2026-10-08, a 125-byte module in a Worker, not
  Dolly code): an import that enters Wasm again through
  `WebAssembly.promising` gets a fresh stack and the callee has finished when
  the call returns, in both browsers, so nothing has to suspend and no
  `Suspending` import is needed. A recursion that hops every 2,048 frames
  reached 1,593,343 frames in Chrome 151 (777 nested hops; 8,191 without
  fresh stacks) and 262,144 in Firefox 155 (128 hops; 512 failed). 400 hops
  with 819,200 calls took 9.0 ms. After an overflow inside such a call
  Firefox failed every later one in that Worker; a Dolly process ends there
  anyway. Not solved by this: when to hop, since Wasm cannot read the
  browser stack's depth.
- `cc` therefore cannot compile about 770 chained member calls in one
  expression (Chrome; 700 fit and 760 fail in Firefox 155, where the entry
  changes nothing) or 3,300 to 4,000 consecutive `case` labels under
  `-Wimplicit-fallthrough` (Chrome; Firefox fails on the 6,020 too).

Checked after the integrator's review (2026-10-07 night):

- **Whole core suite** with the JSPI entry, `node test/browser-tests.mjs
  chromium firefox` (988 s): every test passes in both browsers except
  `fs-growth-browser.mjs` in Chrome, `Target crashed`. That test fills 8 GiB
  and the browser slot caps the run at 6 GB (journal: `killed by the OOM
  killer`); it fails at the same line with the entry reverted. Not run: the
  GPU render test (needs a display).
- **Cold, N of N**: six fresh Chrome instances, each compiling both files
  once with the flags `llvm-build`'s CMake emits, three in each order:
  `MSP430.cpp` 6 of 6 (5.3-5.9 s first, 2.9-3.4 s second), `SemaARM.cpp` 6 of 6
  (12.1-12.6 s first, 9.8-10.3 s second), and no overflow line in any log, so
  no retry hid a failure.
- **Margins**, calls needed against calls that fit: `MSP430.cpp` needs 635;
  Chrome through JSPI fits 760 cold and at least 800 after V8 tiers up, Chrome
  directly 400, Firefox 700. `SemaARM.cpp` as the recipe builds it (`-w`) also
  compiles with the direct entry (6 of 6), so it needs under 500 KB of the
  950 KB; with `-Wimplicit-fallthrough` it needs 6,020 labels where 3,300 to
  4,000 fit.
- **Firefox 155**: `MSP430.cpp` compiles (2 of 2, 4.5 s and 3.3 s) and
  `SemaARM.cpp` compiles without `-Wimplicit-fallthrough` and fails with it,
  as in Chrome. The entry gains Firefox nothing: its Worker stack was never
  the smaller one.
- **What a user sees** when the stack runs out, in both browsers: the three
  attempts of `c++`, each `dolly: process N failed: Maximum call stack size
  exceeded` (Firefox: `too much recursion`), `dolly: compiler process failed;
  retrying 2/3`, then status 126 after 12-13 s. The shell prompt returns and
  the next compile works; no hang, no tab crash.

Found on the way: since `ce294685` (2026-10-06) the target no longer defines
`__EMSCRIPTEN__`, and `clang/Support/Compiler.h` defines `CLANG_ABI` only for
ELF, Mach-O, Windows and Emscripten: every Clang unit that includes
`Attr.h` fails (`variable has incomplete type 'class CLANG_ABI'`). The static
configuration upstream provides, `-DCLANG_BUILD_STATIC`, compiles them.

## The closure and the compiler, built inside Dolly (2026-10-08)

Three images in `demos/llvm`, each built once in headless Chrome 151 through
`npm run image` under the 9 GB `bigbuild` slot, image inputs `c62b2710…`, the
seed compiler unchanged. The 16-core host ran other agents' builds (mean load
5.6). Memory is the PSS of the builder's Chrome, summed over its processes
every 10 s. Logs: `build/llvm-evidence/build/` (not kept).

**`llvm-build`** (`FROM llvm-tablegen`): the 2,559 units, first run, no failed
unit, no retried compiler process, no warning.

| step | wall |
| --- | --- |
| extract the staged tree | 10.5 s |
| `cmake -C /usr/lib/llvm-build/Dolly.cmake` | 67.0 s |
| `make -k -j4`, the seed's five targets | 2,491.7 s (41.5 min) |
| whole image, with snapshot and packs | 2,622.9 s |

- Peak 5.63 GB while compiling and 6.50 GB while the 604 MB snapshot was
  captured. Four jobs is the count the 32-process cap allows (three processes
  a job); `-j6` and `-j8` failed on 2026-10-01 and were not tried again.
- It keeps `/usr/lib/llvm-build`: 103 archives with 2,559 members (223.3 MB),
  the names and member lists of the seed's `.cache/llvm-wasm/lib`; Clang's
  resource directory; the configured and generated headers. Of those 501
  files 499 are the seed tree's bytes, `config.h` differs in
  `HAVE__UNWIND_BACKTRACE` as before, and `Dolly.cmake` is the recipe's own.
- Flags or tools the driver lacked: none. What the build needed instead was
  configuration: `CLANG_BUILD_STATIC` and `LLVM_ENABLE_WARNINGS=OFF` (above),
  with `-include endian.h`, `-std=gnu17` and the host-triple patch that
  `llvm-tablegen` already had. The warning switch leaves `-w` and three
  `-W…` flags on each command; `cc` took them.
- The configuration is a CMake initial-cache file the image keeps, so a later
  stage configures from the same file.

**`llvm-cc`** (`FROM llvm-build`): the compiler.

- `link-compiler.slop` compiles the seed's driver (`src/compiler.cpp`,
  `compiler-main.c`, the two contract digests, staged as sources) with the
  flags of `toolchain/CMakeLists.txt` and links it with the 103 archives
  and `-Wl,--initial-memory=33554432`: 9.8 s for both. The executable is
  127,138,140 bytes (code 87.5 MB, data 8.3 MB, names 31.0 MB; the seed, which
  binaryen shrinks and strips, is 78,338,796).
- `diff -r` finds the resource headers built here identical to the seed's.
- `check.slop` (174.5 s) runs the seed compiler and the new one on the same
  arguments and requires the same bytes: a C and a C++ program, linked, which
  also run and print what they should (`sqrt`, `strdup`, a file; `std::map`,
  a virtual call, a caught exception), and eleven objects: the two at `-O0 -g`
  and `-O2`, the driver itself, and LLVM's `regcomp.c`, `APFloat.cpp`,
  `ItaniumDemangle.cpp`, `SLPVectorizer.cpp`, `MSP430.cpp`, `SemaARM.cpp` and
  `SemaExpr.cpp` with the closure's flags. All thirteen are identical; no
  difference to explain. (An executable linked straight from sources differs
  with its output path alone: `cc` names the scratch object by a hash of that
  path and wasm-ld records the name. Both compilers therefore write the same
  path.)
- The image then installs the compiler as
  `/usr/libexec/dolly/process-bin/compiler`: its `cc`, `c++`, `ld` and `ar`
  are built by Dolly. Peak 5.89 GB; snapshot 653 MB.
- `demos/llvm/test/llvm-browser.mjs` opens the image in Chrome and Firefox:
  `cc -c`, `ar`, a C++ program linked against that archive and run, and a
  640-call chain compiled. Both pass (12.4 s, 22.1 s).
- Before the build, the same rows passed against the seed's own archives
  staged as a fixture: Dolly's `c++` linking host-built objects gives a
  compiler with the same outputs too.

**The second stage**, first as an image `llvm-stage2` (`FROM llvm-cc`; since
replaced by a test, below): the closure and the compiler again, built by the
compiler `llvm-cc` installed; same sources, cache file, paths, targets and job
count. First run, no failed unit and no retry.

| step | wall |
| --- | --- |
| `cmake -C` | 75.0 s |
| `make -k -j4` | 2,625.0 s (43.8 min; the seed compiler took 2,491.7 s) |
| driver and link | 7.4 s |
| `llvm-cc` and `llvm-stage2` together, with snapshots | 3,024.7 s |

- `cmp` finds each of the 103 archives identical to the first stage's, and
  the linked compiler identical to the installed one (127,138,140 bytes,
  SHA-256 `99f690ad…07d3cc37`). The recipe fails at the first difference, so
  the image exists only when all of them hold.
- Peak 6.18 GB while compiling, 7.20 GB while capturing the snapshot.
- What this shows: the compiler built by the host-built seed and the compiler
  built by that compiler are the same bytes, so are their 2,559 objects, and
  two builds an hour apart, by different compiler executables, were
  deterministic. The TableGen tools are still `llvm-tablegen`'s, built by the
  seed; their outputs are the seed's bytes (above), so they were not rebuilt.

**A third stage**, run once and not kept as a recipe: `llvm-stage2`'s rows
`FROM llvm-stage2`, so built by a compiler with the second stage's bytes.
`cmake -C` 70.3 s, `make -k -j4` 2,580.8 s, driver and link 6.8 s, image
2,738.6 s, peak 7.37 GB at the snapshot. All 103 archives and the compiler are
again identical: stage 3 equals stage 2 equals stage 1. No recipe is kept for
it because it would repeat `llvm-stage2` row for row with the same inputs.

`MSP430.cpp` and `SemaARM.cpp` compiled on the first attempt in all three
closure builds (no `retrying` line in any log), the last two by the compiler
that has no binaryen pass.

## What the catalog builds and what a user gets (2026-10-08)

Integrator's review, 03:00: a catalog round builds every recipe, so stages
that only prove reproducibility must not be recipes.

- **Decision**: `llvm-build` and `llvm-cc` stay recipes (the product, a
  compiler built in Dolly), with a small package `llvm` beside them. The
  second stage is `demos/llvm/test/stage2-browser.mjs`, run on demand: it
  opens `llvm-cc`, runs `llvm-build`'s own rows again (read from the recipe,
  so the two cannot drift), then requires every archive, the linked compiler
  and the three TableGen tools to be the first stage's bytes. A third stage
  is the same test again. `Dollyfile-llvm-stage2` is gone. Least code: one
  test of 38 lines, no change to how the catalog finds recipes.
- **The test's first run** (Chrome 151, under the 9 GB slot beside three
  other suites of mine, mean load 8.0): passed in 3,060.6 s. Peak 6.69 GB of
  PSS over the processes of its scope (sampled from 15 minutes in; the
  scope's own peak, file cache included, 7.38 GB), so it needs the 9 GB slot,
  not the 6 GB one. Not run in Firefox.
- **Before it went**, `llvm-stage2` was rebuilt once with the TableGen tools
  added (`make -k -j4` 2,569.5 s; tools 91.6 s): the 103 archives identical
  again, the three tools identical to `llvm-tablegen`'s, and then the
  compiler `cmp` failed at byte 96,090,163. That byte is the last digit of
  `dolly-cc-2df6e34eb8269ab1-106.wasm`, the module name wasm-ld takes from
  `cc`'s scratch output, whose number counts the link's inputs: the tools'
  build had added archives to `lib/`, which the link globs. Not a compiler
  difference; the test links the compiler before it builds the tools.

| image | role | build, one builder | snapshot |
| --- | --- | --- | --- |
| `llvm-tablegen` (as before) | toolchain | about 7 min (steps 426 s, round of 2026-10-07) | 343 MB |
| `llvm-build` | toolchain | 2,623 s, 9 GB slot | 604 MB |
| `llvm-cc` | toolchain, opens | 236 s | 653 MB |
| `llvm` | package | 27 s (the command 39.5 s) | 263 MB |
| second stage | test, on demand | 3,061 s, 9 GB slot | none |

- **A full round** now has three more recipes than before this task and
  spends 48 more minutes of one builder on them (2,886 s; with the second
  stage as a recipe it was 94). They form one chain after `cmake-build` and
  `python`, so a round's wall time grows only if nothing else runs beside it;
  `llvm-build` needs the 9 GB slot (5.6 GB compiling, 6.5 GB capturing).
  A change to the seed rebuilds all of it; a change elsewhere reuses it.

What a user gets, checked in Chrome 151 and Firefox 155
(`demos/llvm/test/llvm-browser.mjs`, whose parts pass on the merged tree: the
image 13.3 s and 28.7 s, the package 9.3 s and 9.0 s, `core/llvm-runtimes`'
part 455.5 s and 546.2 s; the image opened directly in a scratch run). On
that tree the core, process, threads, dso, cpp and amy suites also pass in
both browsers.

- **A package.** In a session, `amy install llvm` (2.4 s in a `default`
  session: `amy: llvm installed: 1948 files, 262650558 bytes, commands: ar c++
  cc ld llvm-c++ llvm-cc make`). `llvm-cc` and `llvm-c++` run the compiler
  built in Dolly, `/usr/lib/llvm/compiler` (127,138,140 bytes), with the
  arguments of `cc` and `c++`; the package installs `cc` for the headers and
  libraries, so the seed's `cc` and `c++` (78,338,796 bytes) are there too.
  The test compiles an object with each pair and links and runs a C++ program
  with each: the same bytes for the same output path, from two different
  compiler executables.
- **An image.** `/llvm-cc/` opens with a shell (7.4 s, 8.8 s) in which `cc`,
  `c++`, `ld` and `ar` themselves run that compiler.
- It is a second compiler beside the seed's, not a replacement: no other
  image changes, and the seed is still what builds `llvm-build`.

## Decisions (2026-10-01, delegated)

- LLVM-in-Dolly stays a demo (`demos/llvm`): moving CMake and Python into core
  would grow the core, against the owner's direction.
- The Worker stack overflow on `MSP430.cpp`/`SemaARM.cpp` is fixed on the
  compiler side (measure the recursion, reduce frame use or recursion depth),
  not by patching Clang's sources.

## Runtimes built inside Dolly (2026-10-07, `work/llvm-runtimes`)

Branch `core/llvm-runtimes`. Scratch scripts and raw outputs are under
`build/runtimes-evidence/` (not committed).

### Inventory of the shipped archives

Method: `ar tv`, the host-built `llvm-nm` of LLVM 24 (`.cache/llvm-host`) and a
section walk of every member, on the process sysroot the seed was built from
(`.cache/process-sysroot-82cc4452…`, whose archives equal
`.cache/emscripten/sysroot/lib/wasm64-emscripten/`). Source lists and flags are
those of `tools/system_libs.py` at the Emscripten pin (`aeb67926`, the same
bytes in the container and in the pinned checkout's objects); the cc1 lines
come from `em++ -v` in the pinned container.

| Archive (as linked by `src/compiler.cpp`) | Bytes | Members | Code | Data | Debug | Defined | Undefined |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `libc++-ww-wasmexcept.a` | 8,280,018 | 57 | 437,085 | 222,618 | 6,551,784 | 3,530 | 415 |
| `libc++abi-ww-wasmexcept.a` | 1,181,998 | 18 | 83,018 | 31,313 | 905,206 | 444 | 82 |
| `libunwind-ww-wasmexcept.a` | 4,466 | 1 | 94 | 30 | 2,941 | 9 | 3 |
| `libclang_rt.builtins-wasmsjlj-ww.a` | 812,986 | 184 | 77,224 | 47,774 | 523,680 | 383 | 172 |
| `/usr/lib/libclang_rt.builtins.a` (the `pic` variant less `emscripten_setjmp.o`) | 812,590 | 183 | 83,169 | 47,774 | 529,022 | 379 | 172 |

- The `-mt-` twin of each of the first four (`threads/` in the sysroot, linked
  by `-pthread`) is the same file: equal SHA-256. One build serves both.
- Four fifths of the bytes are DWARF: Emscripten builds system libraries with
  `-g` and Dolly's links strip it unless the program is linked with `-g`.
- Sources, all in the pinned commit: libc++ is `system/lib/libcxx/src/**/*.cpp`
  less twelve named files (57 of 69: the top level, `filesystem/` without
  `int128_builtins.cpp`, `ryu/` and three of `experimental/`); libc++abi is 18
  named files of `libcxxabi/src`; libunwind is `Unwind-wasm.c`; the builtins are
  157 of the 181 `compiler-rt/lib/builtins/*.c`, the 20 files of `lib/profile`
  and seven Emscripten files. Member lists equal the source lists, sorted by
  name. The pinned checkout is sparse (`scripts/fetch-pinned-checkout.sh`): its
  work tree has no `compiler-rt` and no `tools/`, its object store has both
  (`git archive`, `git show`).
- Flags (`-ww-wasmexcept`, wasm64, not PIC): libc++ `-Oz -std=c++23 -Wall
  -Werror -g -DNDEBUG -DLIBCXX_BUILDING_LIBCXXABI=1 -D_LIBCPP_BUILDING_LIBRARY
  -D_LIBCPP_DISABLE_VISIBILITY_ANNOTATIONS -DLIBC_NAMESPACE=__llvm_libc
  -Isystem/lib/libcxx/src -Isystem/lib/llvm-libc -fwasm-exceptions`; libc++abi
  the same with `-D_LIBCXXABI_USE_FUTEX -D_LIBCXXABI_BUILDING_LIBRARY
  -DLIBCXXABI_NON_DEMANGLING_TERMINATE -Isystem/lib/libunwind/include`;
  libunwind `-Oz -D_LIBUNWIND_HIDE_SYMBOLS -DNDEBUG`; the builtins `-O2
  -fno-unroll-loops -fno-builtin -DNDEBUG -DCOMPILER_RT_HAS_ATOMICS=1
  -D__WASM_SJLJ__`, no exceptions. In cc1 terms the Emscripten driver adds what
  Dolly's `c++` does not: `-mrelocation-model static`, `-fvisibility=hidden`,
  DWARF 4 (`-debug-info-kind=constructor -gkey-instructions`), prefix maps to
  `/emsdk/emscripten`, `-fdeprecated-macro`; Dolly's adds `-vectorize-loops`
  (Emscripten only above `-Oz`) and compiles PIC.
- Compiler: the container's Clang is `24.0.0git` at `4bfd08c2`, the commit of
  `DOLLY_LLVM_COMMIT`. The shipped archives and Dolly's `c++` are the same
  compiler source, built for x86-64 and for wasm64.
- The library is older than the compiler: Emscripten's copy is libc++ 22.1.8
  with its own patches, and the headers the seed installs are that copy.
  `.cache/llvm-project` holds libc++ 24, another library (58 of the 69 `.cpp`
  files differ); nothing here is built from it.

### Built inside Dolly: `llvm-runtimes`

`demos/llvm/Dollyfile-llvm-runtimes` is a build-only package `FROM
system-tools`: the pinned sources (`dist/static/llvm/runtimes.tar`, 2,660 files,
10.4 MB: `libcxx/src`, `libcxxabi`, `libunwind`, `llvm-libc`, `compiler-rt`
without its sanitizers and `libc/emscripten_internal.h`, from the pinned
commit's objects, their `__EMSCRIPTEN__` tests renamed to `__dolly__` as the
installed headers' are), one Makefile with the source lists and flags above,
`c++`, `cc`, `ar`. It keeps five archives in `/usr/lib/llvm-runtimes` under
their shipped names: the four of the process SDK, with `-mt` links to them, and
the kernel plugins' `libclang_rt.builtins.a`. A process link takes them instead
of the shipped ones with `-L/usr/lib/llvm-runtimes`: the driver's own `-l` names
then resolve there, at the same place on the linker's line.

Method: image builds in headless Chrome 151 on the 16-core host (load 3-6),
wall time from Dolly's `time` in the image log, memory as the whole browser's
PSS sampled every 2 s.

- libc++, libc++abi, libunwind: 76 translation units (57 + 18 + 1), no source
  change, no failure on the first build. `make -j2` 27.2-28.5 s (three builds);
  `make -j1` 44.3 s, the 76 compiles summing to 43.7 s (median 0.34 s;
  `algorithm.cpp` 3.9 s, `locale.cpp` 3.4 s, `ios.instantiations.cpp` 1.9 s,
  `cxa_demangle.cpp` 1.8 s).
- With the process builtins: 260 translation units, `make -j2` 45.9-49.1 s
  (five builds), the whole image build 55-59 s, peak PSS 1.5-1.65 GiB.
- With the kernel plugins' builtins too: 443 units, `make -j2` 60.7-63.2 s
  (three builds), peak PSS 1.6 GiB, snapshot 11.4 MB.
- Reproducible: every build gave the same files, the C++ three at `-j1` and
  `-j2` (SHA-256 `3bc3bbdf…`, `d71be685…`, `5144a5f6…`; builtins `e471d62f…`
  and `ef004e64…`).
- The sysroot lacked one file, for the builtins: `emscripten_internal.h`, a
  libc source header.
- The driver lacked, for the flags of the shipped variant (each passed through
  `-Xclang` instead):
  - a static relocation model (`-fno-pic`): `c++` always compiles
    `-mrelocation-model pic -pic-level 2`, the shipped archives are not PIC;
  - `-ffile-prefix-map`, `-fmacro-prefix-map`, `-fdebug-prefix-map` and
    `-fdebug-compilation-dir` (three members of libc++abi and 19 of the
    builtins hold `__FILE__` strings);
  - `-main-file-name`: without it cc1 names the compile unit `<stdin>`. Plain
    `c++ -g -c g.cpp` does so too: its DWARF says `/tmp/probe/<stdin>`
    (measured in both browsers);
  - the DWARF dialect of Clang's driver: `c++ -g` is
    `-debug-info-kind=standalone -dwarf-version=5`, Emscripten's is
    `constructor`, version 4, `-gkey-instructions`, `-debugger-tuning=gdb`;
  - `-fno-unroll-loops` (rejected as unsupported; the builtins' `-O2` needs it)
    and `-fignore-exceptions`, Emscripten's default exception mode, in which
    the builtins' one C++ file is compiled.
  `-fvisibility=hidden` is accepted. `-vectorize-loops`, which `c++` always
  passes and Emscripten omits at `-Oz`, changed no byte, nor did leaving out
  `-fdeprecated-macro`.
- The driver lacked, for the builtins' four assembly members, an assembler:
  `cc x.S` fails with `WebAssembly assembly is unsupported`, though the
  compiler embeds LLVM's. The recipe gives it the text as file-scope `__asm__`
  in a C file. On the way: `cc -E` leaves out what `cc -c` compiles with
  (`src/compiler.cpp`, `run_clang`): the `exception-handling`, `multivalue` and
  `reference-types` features, so `__wasm_exception_handling__` is undefined
  when preprocessing only and `__c_longjmp.S` came out empty; and the PIC
  level, so `__PIC__` is undefined and `stack_limits.S` took its static branch.
  The recipe adds each to its `cc -E`. `-x assembler-with-cpp` is rejected.
- The driver has no `-nostdlib++`: it names the four archives on every link,
  the builtins and libunwind on C links too. `-L` ahead of the SDK's
  directories is what selects other files.
- Dolly has no `nm` and its `ar` cannot list, so the comparison ran on the host.

### Compared with the shipped archives

Method: the image's snapshot decoded on the host; members cut out of both
archives and walked section by section; `llvm-nm` on both.

- libc++, libc++abi, libunwind, all 76 members: same names in the same order;
  every section equal byte for byte except the four that hold the compiler's
  own version string. Equal are code, data, types, imports, the linking section
  (the symbol table), relocations, `target_features`, `.debug_line`,
  `.debug_abbrev` and `.debug_ranges`. The `llvm-nm` listings are the same
  text: 3,530/444/9 defined and 415/82/3 undefined names.
- The one difference: the shipped objects say `clang version 24.0.0git
  (https:/github.com/llvm/llvm-project 4bfd08c2…)`, Dolly's
  `(https://github.com/llvm/llvm-project.git 4bfd08c2…)`: how each LLVM build
  recorded its repository. It is in `producers` and in `.debug_str`;
  substituting it in the shipped `producers` and `.debug_str` gives Dolly's
  bytes for every member. Its five extra bytes move the later string offsets,
  which is all that differs in `.debug_info` and `reloc..debug_info` (equal
  lengths). No member differs in size by more than 11 bytes; the archives are
  8,280,018 against 8,280,588, 1,181,998 against 1,182,178 and 4,466 against
  4,476 bytes.
- The builtins, 180 C and C++ members: the same result. `-fno-unroll-loops` and
  `-fignore-exceptions` are in the flags.
- The builtins, four assembly members (`stack_ops.S`, `stack_limits.S`,
  `__c_longjmp.S`, `emscripten_tempret.s`): code, data, global, tag, type,
  import and function sections and code relocations equal the shipped ones.
  The shipped ones also carry the assembler's DWARF (so three have four more
  section symbols) and no `producers` or `target_features` section. `llvm-nm`:
  383 defined and 172 undefined names on both sides; the listings differ only in
  those twelve debug section symbols. 812,986 against 812,858 bytes.
- `/usr/lib/libclang_rt.builtins.a`, the variant kernel plugins link (183
  members: PIC, default visibility, no `atomics` or `exception-handling`
  feature, taken off through `-Xclang`; `emscripten_setjmp.o` left out as
  `scripts/prepare-compiler-rt.sh` removes it): 179 C and C++ members equal but
  for the version string, the four assembly members as above, `llvm-nm` 379
  defined and 172 undefined names on both sides. Emscripten compiles it with
  `-mllvm -enable-emscripten-sjlj` where `cc` fixes `-wasm-enable-sjlj`; no
  member shows it. The seed's file has no archive index (the host `ar` of that
  script drops it; wasm-ld reads the members themselves): 812,590 against
  820,834 bytes.

Shipped: the pinned container's Clang (x86-64 build of LLVM `4bfd08c2`, run by
`embuilder`). Dolly's: the seed compiler (wasm64 build of the same commit, run
as `c++` in the browser). No code section differs, so there was no
instruction-level difference to look at.

### In Chromium and Firefox

`demos/llvm/test/llvm-browser.mjs` opens `llvm-tablegen` with the package
installed (`INSTALL`, plus the display and `threads@0`) and, in Chrome 151 and
Firefox 155:

- links `demos/llvm/test/fixtures/runtime.cpp` (exceptions through five frames
  with destructors, nested and rethrown, `dynamic_cast`, library exceptions;
  `iostream` formatting and parsing, `to_chars`; `std::filesystem` trees) and
  `test/fixtures/threads-cpp.cpp` (`std::thread`, mutex, condition variable,
  exceptions and TLS destructors in threads, `-pthread`) twice each, without
  and with `-L/usr/lib/llvm-runtimes`. `-Wl,--trace` shows 55 and 46 members
  loaded from the four archives in `/usr/lib/dolly/process` in the first link
  and none in the second, which loads as many from `/usr/lib/llvm-runtimes`.
  The two executables of each program are the same bytes (`cmp`; 632,299 and
  78,737 bytes), and the program runs;
- links `runtime.cpp` again with `-rdynamic`: a host of shared objects exports
  the whole runtime, so its link loads 96 members of the four archives (53 of
  libc++'s 57, all 18 of libc++abi, libunwind, 24 builtins). The two
  executables are the same 2,090,398 bytes, and the host runs;
- links a kernel plugin (`cc --dolly-kernel-plugin -shared`, one `__int128`
  multiplication) with the seed's builtins archive and with the built one
  named before it: the trace shows `multi3.o` from the one and from the other,
  and the two plugins are the same bytes (linked and validated; nothing here
  loads a plugin);
- configures LLVM with the `llvm-tablegen` recipe's own `cmake` line plus
  `-DCMAKE_EXE_LINKER_FLAGS=-L/usr/lib/llvm-runtimes`, builds `llvm-min-tblgen`
  and `llvm-tblgen` (`make -j2 llvm-tblgen WebAssemblyCommonTableGen`), whose
  links load 99 members from the built archives and none from the shipped
  ones, and compares the 18 WebAssembly `.inc` files they generate with those
  the image kept from its own, shipped-runtime tools: equal (`cmp`).

| | Chrome 151 | Firefox 155 |
| --- | --- | --- |
| whole test (six runs) | 323.3-347.1 s | 369.1-417.7 s |
| its `make -j2` (both tools, then the TableGen runs) | 246.5-248.5 s | 298.5 s |
| peak PSS of the browser | 4.2-4.3 GiB | 3.9 GiB |

(The `make` and PSS rows are from separate runs of the same commands that
print them.) The rebuilt `llvm-tblgen` (6,203,893 bytes) and
`llvm-min-tblgen` (1,750,939) each differ from the image's tool in one byte: a
digit of the linker's scratch file name in the `name` section, which counts
the inputs and so the `-L`. A whole rebuild of LLVM's TableGen in another
session is otherwise the same executable.

Named as inputs instead (`c++ x.cpp /usr/lib/llvm-runtimes/libc++-…a …`), the
archives also win, but the linker loads members in another order and the
executable differs in size by a few bytes.

### With the driver's own flags only

The same Makefile without any `-Xclang` (PIC, no DWARF, the two rejected flags
dropped), before the kernel plugins' variant: 260 units in 42.3 s. Same defined names; the undefined
ones gain `__memory_base` and `__table_base`. Code grows 1.9% in libc++
(445,272 bytes), 3.0% in libc++abi and 7.3% in the builtins; without DWARF the
archives are 1.73 MB, 0.28 MB and 0.27 MB. Both test programs link against it
and print the same in both browsers; the executables are 1.0% and 1.4% larger.

### Replacing the shipped archives

The plan as written before the replacement. `core/runtimes-in-seed` then did
it for libc++, libc++abi and, differently from this plan, libunwind: see "The
replacement" below.

Today: linking the C++ probe and `scripts/build-process-threads.sh` make the
container build the archives (`scripts/build.sh:226-232`);
`scripts/prepare-process-sysroot.sh` copies eight files (four, and their `-mt`
twins) into the process sysroot and lists their symbols into
`dynamic-provider.symbols` with `llvm-nm`; `toolchain/CMakeLists.txt:92` packs
the sysroot into the seed, where the eight are 20.6 MB of 126.8 MB (libc++ and
libc++abi 18.9 MB); `Dollyfile-system-build:2162-2178` installs the headers and
exports the archives; `src/compiler.cpp:870-887` names them on every link.

libc++ and libc++abi can move now:

1. `Dollyfile-system-build`, where it installs the libc++ headers: `SOURCE` the
   runtime sources and run this Makefile's two libraries into
   `/usr/lib/dolly/process`, with the `threads/` names as links. `make`, `tar`
   and `ar` exist by then and nothing before that point is C++. A root build
   gains 27 s at `-j2` (44 s serial) and a 10 MB source. The staging moves from
   `demos/llvm/prepare-sources.sh` to the core's, since the core never depends
   on a demo.
2. `prepare-process-sysroot.sh` stops copying those four files: the seed
   shrinks by 18.9 MB. `test/process-sysroot.test.mjs` lists them.
3. `dynamic-provider.symbols` is made on the host from the container's
   archives. The names are equal (measured), so it can stay as it is while the
   container builds libc++ anyway (5). To drop that, the driver would read the
   archives' symbol tables at link time; Dolly has no `nm`.
4. `docs/sources.md`: the third row of the exceptions table goes.
5. The seed compiler and `process-cpp-check` are C++ programs linked by `em++`
   on the host, against the container's libc++. That is the table's second row,
   and ends when the compiler is linked inside Dolly, against this libc++:
   seed compiler, libc++ from source, then LLVM, Clang and LLD. Until then the
   container's archives stay available as the check used here.
6. What rebuilds: the seed changes and `Dollyfile-system-build` changes, so
   every image does. The kernel does not. Programs do not change:
   an executable linked against the built archives is the same bytes.

libunwind and the builtins stay with libc for now. The driver names both on
every link, C included, so they must exist before the first link of a root
build: the Dollyfile engine, which `bootstrap` compiles before any recipe, shell
or Make runs. Building them first means `bootstrap` compiling 185 files itself,
or libc built in Dolly, of which they are part in practice (`libc-ww.a`,
dlmalloc, `libstandalonewasm` and `libstubs` come from the container too). The
builtins also want an assembler in `cc`. The kernel plugins' variant is linked
by path only when a plugin is built, so it could be built in `system-build`
like libc++, in place of `scripts/prepare-compiler-rt.sh`.

For the driver (`src/compiler.cpp`, not changed here), in order of use:
`-main-file-name` for every compile (a `-g` bug by itself); the same target
features and PIC level under `-E` as under `-c`; `-fno-pic`;
`-ffile-prefix-map`; `-fno-unroll-loops`; an assembler entry for `.s` and `.S`;
`-nostdlib++`. With them the recipe needs no `-Xclang`. Or decide that Dolly's libc++ need not be
Emscripten's bytes: the plain variant above builds today and costs 1-2% of code.

### Merged with `core/llvm-in-dolly` (2026-10-08)

`9e90e8f1` merges `bb2fa2ec`. For a repeat: `demos/llvm/prepare-sources.sh`,
the README's image list and the upstream rows keep both sides, theirs first;
`demos/llvm/test/llvm-browser.mjs` is their file unchanged, followed by the
runtime part.

- The runtime part now opens `llvm-cc` with the package installed, so the
  compiler built inside Dolly compiles and links against the runtime built
  inside Dolly; the TableGen tools it rebuilds that way still write the 18
  kept outputs.
- Checks on the merged tree: `update-recipe-pins.mjs` changes nothing (76
  recipes), lint, 416 source tests. Demo test: the compiler part 12.8 s in
  Chrome and 29.5 s in Firefox, the runtime part 384.9 s and 461.5 s. The
  runtime part peaks at 5.8 GiB of PSS in Chrome on that 653 MB image, under
  the browser slot's 6 GiB.
- `llvm-build`, `llvm-cc` and `llvm-stage2` were imported from `work/llvm/dist`
  (snapshot and metadata copied, 60 packs hard-linked); the plan reuses them.
- The image list is whole again (76): pinning, source preparation and routes
  for every image took 17.5 min. A full `npm run image` would still build four:
  `dolly-docs`, `pi`, `pi-local` and `dollyfile-studio`, because the merged
  branch changed `docs/browser-boundary.md`, which `Dollyfile-dolly-docs` pins.
  They were not built here.

### The replacement: `core/runtimes-in-seed` (2026-10-08)

A branch from the merged `core/llvm-runtimes`. `Dollyfile-system-build`
compiles libc++, libc++abi and libunwind from the pinned source where it
installs the libc++ headers; the seed no longer carries Emscripten's archives
of the three or their `-mt` twins.

What changed (the driver apart from the recipe; `bc2a5af2`, `79a3365f` and
`a2c47d5a` follow up: the Rust seed's link and the pins of the staged driver,
the demo package on the new flags, an artifact check):

- `968a7af9`, the driver (`src/compiler.cpp`), each checked by behaviour in
  `test/cpp-browser.mjs`: `-fno-pic` (static code: a program links it, a shared
  object refuses it); `-ffile-prefix-map`, `-fdebug-prefix-map` and
  `-fmacro-prefix-map`; `-fno-unroll-loops`, `-funroll-loops` and
  `-fignore-exceptions` passed to cc1; `-nostdlib++`; `-main-file-name` for
  every compile, so `-g` names the unit; and the relocation model, the target
  features and the exception model under `-E` as under `-c`.
- `5cc9db78`, the recipe and the seed: the root recipe's Makefile (76 units,
  `-Oz -g -fno-pic -fvisibility=hidden -ffile-prefix-map=/tmp/cpp=/emsdk/emscripten`,
  no `-Xclang`); `scripts/prepare-image-sources.sh` stages
  `dist/static/default/libcxx.tar` (2,415 files, 9.5 MB) with the headers'
  rename; `scripts/prepare-process-sysroot.sh` no longer copies the six files
  and reads the container's three for `dynamic-provider.symbols`;
  `scripts/build-process-threads.sh` no longer builds the `-mt` three. The
  driver names one set for threaded links (`-lc++-ww-wasmexcept` resolves in the
  parent of `threads/`) and names the unwinder only once it exists.
- An assembler was not added. The builtins, which have the four assembly
  members, stay in the seed (below), so nothing built here needs one. What I
  would choose: `cc x.s` writes the text as file-scope `__asm__` into an empty
  C unit and compiles that, about a dozen lines in `run_frontend`; it gives the
  code, data and symbols of Clang's own assembler (measured above) without its
  DWARF. The full way is the MC path of `clang/tools/driver/cc1as_main.cpp`,
  about sixty lines; the WebAssembly parser is already linked.

The bootstrap order:

- libc++ and libc++abi: nothing before that point of the root recipe is C++.
- libunwind is on every link line and libc's `standalone.o`, which nearly
  every program loads, refers to `_Unwind_RaiseException`; but that reference
  is dead in a C program. Measured: with no unwinder in the SDK a C program
  using `setjmp` links and runs, and a C++ link fails naming the missing
  symbols. So the driver leaves `-lunwind-ww-wasmexcept` out while the file
  does not exist: `bootstrap`'s engine and the root recipe's C programs link
  before the step, as they must.
- The builtins stay with libc. The first link (the engine, before any recipe
  runs) uses them, there are 184 units and four are assembly. The order that
  would work: `bootstrap` compiling and archiving them itself before the
  engine, or libc built in Dolly, of which they are part.

Measured (Chrome 151 builders, one at a time; memory as the builder's PSS):

- Seed: 126,823,257 to 107,890,211 bytes (18.9 MB less). Image inputs
  `c62b2710…` to `ad8973ea…`. `npm run build:runtime`: 58 s.
- The step in the root recipe: 0.7 s to fetch and extract the sources, then
  `make -j2` 29.4 s (51.1 s serial), timed by itself in the rebuilt `system`
  image, where it gives the SDK's three files again (`cmp`). The whole
  `system-build` image builds in 50.4 s. Its snapshot goes from 137,034,910 to
  127,455,119 bytes.
- The archives against the container's, the ones shipped until now: the same
  76 members in the same order, and every section equal byte for byte except
  the debug sections, `producers` and `linking`. `llvm-nm` prints the same
  3,530/444/9 defined and 415/82/3 undefined names; its listings differ only in
  the names of debug sections (the driver's `-g` is DWARF 5, Emscripten's 4,
  which is also what differs in `linking`). 8,317,050, 1,023,610 and 4,516
  bytes against 8,280,018, 1,181,998 and 4,466.
- The chain `system-build`, `system`, `default`, `cc`, `cmake-build`,
  `llvm-tablegen` is 17 images with their bases: 41.9 min (`zig-build` 433 s,
  `cmake-build` 1,224 s, `llvm-tablegen` 445 s, `python` 116 s, `system-tools`
  104 s), peak 4.1 GiB.
- Every one of the 17, compared file by file with the image the old seed
  built: nothing differs but the recipe records under `/etc/dolly`, the SDK's
  three archives and `SHA256SUMS`, and the compiler; the three `-mt` files are
  gone. All programs are the same bytes: 2,086 of 2,098 paths in
  `system-build` (Slop and the tools linked before the unwinder existed
  among them), 6,501 of 6,522 in `cmake-build` (CMake, a C++ program of
  hundreds of units), 8,468 of 8,492 in `llvm-tablegen` (the three tools and
  every TableGen output), 1,695 of 1,708 in `python`.
- The core browser suite (`node test/browser-tests.mjs`, 30 files) on those
  images plus `dolly-docs`, `cmake`, `git`, `audio-sdk` and `gpu-sdk` (five
  small images, 80 s together), in Chrome 151 and Firefox 155: 28 files pass in
  both, `cpp` with the new driver checks, `threads`, `dso` and `image` among
  them. `amy-browser.mjs` passes until `amy install sdl2`, an image not built
  here. `fs-growth-browser.mjs` cannot run in the browser slot: it fills most
  of 8 GiB by design and the slot's 6 GiB cgroup kills the browser (`Memory
  cgroup out of memory`, kernel log 03:41:19 and 03:48:29); it reports `Target
  crashed`.

What the full catalog round has to do with this branch:

1. `npm run build:runtime` (the seed above), then rebuild the Rust compiler
   seed: its inputs include the sysroot, and `demos/rust/toolchain/link.sh`
   now takes the container's libc++, libc++abi and libunwind by path. Run
   here on a copy of the root checkout's `build/rustc-port/package` with the
   new sysroot: it links `rustc.wasm` (163.8 MB, 16 s), which satisfies
   `dolly-process-0`. The whole seed build was not run.
2. Build every image: the seed changed. The 23 built here can be imported
   from `work/llvm-runtimes/dist` if the round's image inputs are
   `ad8973ea…`. Nothing else is special; the source pins this branch touches
   (`libcxx.tar`, and `compiler.cpp` for `llvm-cc` and `llvm-stage2`) are
   committed.
3. Run the demo test of `demos/llvm` once `llvm-cc` exists on the new seed (it
   needs `llvm-build`, 44 min). Its runtime part passes on the new seed against
   `llvm-tablegen` instead (a scratch copy: 373.4 s in Chrome, 392.9 s in
   Firefox): the link that takes the root-built SDK and the link that takes
   the package give the same executables. `llvm-runtimes` still builds all
   five archives; three of them now repeat the root recipe and can go, leaving
   the builtins.
4. `fs-growth-browser.mjs` under a larger cap than the browser slot's.

`llvm-runtimes` on this branch uses the driver's new flags in place of their
`-Xclang` spellings (`-fno-pic`, `-ffile-prefix-map`, `-fdebug-prefix-map`,
`-fno-unroll-loops`, `-fignore-exceptions`, no `-main-file-name`, nothing
added to `cc -E`): 443 units, 80.7 s, and the five archives have the SHA-256
of every earlier build (`3bc3bbdf…`, `d71be685…`, `5144a5f6…`, `e471d62f…`,
`ef004e64…`), also of the build with the old flags on the new seed. Only
Emscripten's DWARF dialect and the two feature removals of the kernel plugins'
builtins still go through `-Xclang`.

`test/dolly.artifacts.mjs` gained the one coupling this leaves: the host lists
what an `-rdynamic` host exports from the container's archives, programs link
the root-built ones, and the test requires the names the built archives define
(read from their indexes in the `system-build` snapshot) to be the listed ones.
It passes here; the rest of that file needs the whole catalog.

Left as it was: `Unwind-wasm.c` prints three C23-extension warnings in the
root build (Emscripten passes `-Wno-c23-extensions`); the builtins and libc
stay container-built; `dynamic-provider.symbols` is still listed on the host
from the container's three archives, whose names equal the built ones'.

In this worktree `dist/` now holds the new seed and those 23 images; the other
snapshots are the old seed's and stale. The old runtime is in `work/llvm/dist`.

Merged again with `core/llvm-in-dolly` at `98aaa51b`, which had taken
`core/llvm-runtimes` and gone on (`9b2edc6c`; `core/llvm-runtimes` is
fast-forwarded to that head). The conflicts were recipe pins, taken from this
branch and pinned again, the removed `llvm-stage2` and one upstream row. 76
recipes lint, 416 source tests pass, the images built here stay current except
`dolly-docs`, rebuilt for a changed document, and `cpp` and `docs` pass again
in both browsers. The `llvm` package and the demo's two tests need `llvm-cc` on
the new seed.

## The rest of the process sysroot, built inside Dolly (2026-10-08, `core/runtimes-in-seed`)

Asked: the C library and everything else of `/usr/lib/dolly/process` that is
still only prebuilt, inventoried, rebuilt inside Dolly from the pinned source
and compared with what the seed ships. Reproduction, not replacement: the
first link of a root build needs these.

### Inventory

What a link takes is fixed in `src/compiler.cpp`: `crt1.o`, all of
`libdolly-process.a`, every other `libdolly-NAME.a` of the directory (the host
clients), then `-lstandalonewasm-ww-memgrow -lstubs -lc-ww -ldlmalloc-ww
-lclang_rt.builtins-wasmsjlj-ww` and, for C++, the three archives the root
recipe now builds; `-pthread` takes the same names from `threads/` with `-mt`.
There is no separate `libm`, `libpthread`, `libdl` or `librt`: musl's are in
libc, and the driver knows `-lc -lm -ldl -lrt -lpthread -lutil` as the process
runtime's own (`is_implicit_process_runtime_library`). No recipe's `EXPORTS LIB` names
one of these archives except the two host clients `dolly-gpu` and
`dolly-audio` and the C++ pair.

Measured on this branch's sysroot (`build/runtimes-evidence/sysroot/inventory.tsv`;
bytes of the file, of its code, data and DWARF sections; names `llvm-nm` lists):

| File | Members | Bytes | Code | Data | Debug | Defined | Undefined | From |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `libc-ww.a` | 1,010 | 3,329,684 | 291,103 | 219,149 | 1,990,417 | 6,284 | 3,401 | container, six members removed |
| `libdlmalloc-ww.a` | 2 | 97,754 | 18,737 | 1,020 | 71,635 | 67 | 14 | container |
| `libstandalonewasm-ww-memgrow.a` | 15 | 91,230 | 10,229 | 674 | 61,704 | 190 | 80 | container |
| `libstubs.a` | 2 | 23,564 | 1,178 | 98 | 17,887 | 75 | 8 | container |
| `libclang_rt.builtins-wasmsjlj-ww.a` | 184 | 812,986 | 77,224 | 47,774 | 523,680 | 1,273 | 511 | container (rebuilt by `llvm-runtimes`) |
| `crt1.o` | 1 | 602 | 35 | 0 | 0 | 1 | 5 | `scripts/build.sh` |
| `libdolly-process.a` | 11 | 51,684 | 27,159 | 4,712 | 0 | 227 | 59 | `scripts/build.sh` |
| `libdolly-runtime.a` | 1 | 15,742 | 9,028 | 1,237 | 0 | 75 | 38 | `scripts/build.sh` |
| `libdolly-{audio,display,download,dso,gpu,http,threads,upload}.a` | 9 | 25,548 | 13,152 | 369 | 0 | 64 | 48 | `scripts/build.sh` |
| `threads/libc-mt.a` | 1,123 | 3,722,512 | 312,308 | 221,639 | 2,259,865 | 7,032 | 3,714 | container, 16 members removed |
| `threads/libdlmalloc-mt.a` | 2 | 89,924 | 15,810 | 1,096 | 67,114 | 69 | 18 | container |
| `threads/libstandalonewasm-mt-memgrow.a` | 15 | 91,230 | 10,229 | 674 | 61,704 | 190 | 80 | container, the `-ww` bytes |
| `threads/libclang_rt.builtins-wasmsjlj-mt.a` | 184 | 812,986 | 77,224 | 47,774 | 523,680 | 1,273 | 511 | container, the `-ww` bytes |
| `threads/crt1.o` | 1 | 573 | 29 | 0 | 0 | 1 | 4 | `scripts/build-process-threads.sh` |
| `threads/libdolly-process.a` | 7 | 49,578 | 31,030 | 3,666 | 0 | 157 | 78 | `scripts/build-process-threads.sh` |
| `threads/libdolly-runtime.a` | 1 | 16,608 | 9,681 | 1,247 | 0 | 76 | 38 | `scripts/build-process-threads.sh` |

Dolly takes members out of the two libc archives, because its own parts
define those names: `raise.o sigaction.o pthread_sigmask.o sigtimedwait.o
setitimer.o getitimer.o` from `libc-ww.a` (`scripts/prepare-process-sysroot.sh`),
those and ten more (thread lifecycle, futex, `sched_yield`) from `libc-mt.a`
(`scripts/build-process-threads.sh`). The container's own archives have 1,016
and 1,139 members.

Sources and flags, read from `tools/system_libs.py` in the pinned container
(`demos/sysroot/list-units.py` asks its library classes;
`build/runtimes-evidence/sysroot/units.tsv` has the member, source and `emcc`
flags of all 2,191 units, `cc1-lines.txt` the `cc1` line of each flag set).
The member names and their order computed this way equal the seven shipped
archives'. Paths are under `system/lib`:

| Archive | Units | Sources | Emscripten's flags, besides `-g -DNDEBUG -fno-unroll-loops` |
| --- | ---: | --- | --- |
| `libc-ww.a` | 1,016 | 984 `libc/musl/src`, 21 `libc`, 5 `libc/compat`, 6 `pthread`; 3 are `.S` | `-Os`, 69 libcall units `-O2`; `-std=c99 -D_XOPEN_SOURCE=700 -fno-inline-functions -fno-builtin`, seven musl include directories, `-sWASM_WORKERS` |
| `libc-mt.a` | 1,139 | 1,098 `libc/musl/src`, 20 `libc`, 5 `libc/compat`, 16 `pthread`; 3 are `.S` | the same with `-pthread` |
| `libdlmalloc-ww.a`, `-mt` | 2 | `dlmalloc.c`, `libc/sbrk.c` | `-O2 -fno-builtin`, `-sWASM_WORKERS` or `-pthread` |
| `libstandalonewasm-ww-memgrow.a`, `-mt` | 15 | 3 `standalone`, 10 `libc/musl/src/time`, 2 `libc/musl/src/exit` | `-Os -fno-builtin`, musl's flags and directories, `-DEMSCRIPTEN_STANDALONE_WASM -DEMSCRIPTEN_MEMORY_GROWTH` |
| `libstubs.a` | 2 | `libc/emscripten_libc_stubs.c`, `libc/emscripten_syscall_stubs.c` | `-O2 -Ilibc/musl/src/include`, no thread flag |

Emscripten compiles all of these without Wasm exceptions (features `+atomics
+bulk-memory`, none for `libstubs`), non-PIC, hidden visibility, DWARF 4, with
its JavaScript `setjmp` model selected.

Dolly's own parts are compiled by `emcc -m64 -O1 -matomics -mbulk-memory
-fwasm-exceptions -sSUPPORT_LONGJMP=wasm -sWASM_LEGACY_EXCEPTIONS=0
-I build/include`, without `-g`:

| File | Sources |
| --- | --- |
| `crt1.o` | `src/process/crt1.c` |
| `libdolly-process.a` | `src/process/{libc-adapter,mmap,time,poll,signal,pthread-stubs}.c`; from Emscripten `pthread/pthread_self_stub.c` and musl's `default_attr.c`, `pthread_mutexattr_{init,settype,destroy}.c` (these six with musl's internal include directories) |
| `libdolly-NAME.a` | each host module's client, as `scripts/host-modules.mjs client` lists them: `src/process/runtime-adapter.c`, `host/{display,http,gpu,audio,download,upload,threads,dso}/client.c`, `host/dso/ffi.c` |
| `threads/crt1.o`, `threads/libdolly-process.a`, `threads/libdolly-runtime.a` | `-pthread` and musl's internal directories for all: `crt1.c`; `libc-adapter mmap time poll signal threads` and `threads-start.S`; `runtime-adapter.c` |

### Built inside Dolly: `sysroot`

`demos/sysroot/Dollyfile-sysroot` (`FROM system-tools`, build-only, keeps
`/usr/lib/sysroot`): the seven Emscripten archives from a 4.8 MB tar of
`system/lib/{libc,pthread,standalone,dlmalloc.c}` at the pin, the two libc
archives without the members Dolly removes, and Dolly's own parts from
`src/process` and the host clients. `units.mk` lists the sources;
`list-units.py` generates it from `tools/system_libs.py` in the pinned
container, so the list is Emscripten's and not a second copy of its rules. A
new demo and not `demos/llvm`: the C library is not LLVM's. When this is
adopted the compiler-rt builtins of `llvm-runtimes` belong here too, and that
image can go (the root recipe builds its other three archives on this branch).

Built in headless Chrome in a build slot, `make -j2`
(`build/runtimes-evidence/sysroot/try1` to `try6`: image and build logs, PSS
samples of the browser every 2 s, the extracted files, the reports):

| Build | Holds | `cc` runs | `make -j2` | Peak PSS | Snapshot bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| `try1` | the seven Emscripten archives; `ar` refused two assembly members | 2,197 | 193.1 s | 1,383 MiB | none |
| `try2` | the same, archived | 2,197 | 198.9 s | 1,448 MiB | 7,841,267 |
| `try3` | and Dolly's own parts, client archives empty by a slip in the Makefile | 2,219 | 197.1 s | 1,444 MiB | 7,969,867 |
| `try4` | all 21 files | 2,229 | 208.4 s | 1,407 MiB | 8,011,118 |
| `try5` | those and the two licence files | 2,229 | 216.6 s | 1,500 MiB | 8,022,961 |
| `try6` | the committed recipe: libc without the 6 and 16 members Dolly removes | 2,207 | 203.7 s | 1,550 MiB | 7,891,483 |

The 2,207 runs of `try6` are 2,193 C units and seven assembly units, each
preprocessed and then compiled as file-scope asm, for 2,200 objects. The
machine was shared (`try4` also ran beside two runs of the source tests), so
the time is 193 to 217 s; a serial build was not measured. The image takes
206.6 s in all. The build repeats: the 21 files of `try5` have the SHA-256 of
`try4`'s (`try5/sha256.txt`), and `units.mk` comes out of the container byte
for byte again.

### Compared with what the seed ships

Section by section (`build/runtimes-evidence/sysroot/compare.sh`, `wasmar.py`),
each file of `try6` against the file of that name in this branch's process
sysroot, and `llvm-nm` line by line:

| File | Members | Shipped bytes | Built bytes | Sections that differ (members) |
| --- | ---: | ---: | ---: | --- |
| `crt1.o` | 1 | 602 | 607 | `producers` 1 |
| `libc-ww.a` | 1,010 | 3,329,684 | 3,338,000 | `producers` 1010, DWARF 1008, `linking` 3, `target_features` 3 |
| `libdlmalloc-ww.a` | 2 | 97,754 | 97,774 | DWARF 2, `producers` 2 |
| `libdolly-audio.a` | 1 | 1,912 | 1,916 | `producers` 1 |
| `libdolly-display.a` | 1 | 4,958 | 4,962 | `producers` 1 |
| `libdolly-download.a` | 1 | 1,068 | 1,074 | `producers` 1 |
| `libdolly-dso.a` | 2 | 5,842 | 5,852 | `producers` 2 |
| `libdolly-gpu.a` | 1 | 5,612 | 5,616 | `producers` 1 |
| `libdolly-http.a` | 1 | 3,654 | 3,658 | `producers` 1 |
| `libdolly-process.a` | 11 | 51,684 | 51,738 | `producers` 11 |
| `libdolly-runtime.a` | 1 | 15,742 | 15,746 | `producers` 1 |
| `libdolly-threads.a` | 1 | 1,440 | 1,446 | `producers` 1 |
| `libdolly-upload.a` | 1 | 1,062 | 1,068 | `producers` 1 |
| `libstandalonewasm-ww-memgrow.a` | 15 | 91,230 | 91,380 | DWARF 15, `producers` 15 |
| `libstubs.a` | 2 | 23,564 | 23,584 | DWARF 2, `producers` 2 |
| `threads/crt1.o` | 1 | 573 | 578 | `producers` 1 |
| `threads/libc-mt.a` | 1,123 | 3,722,512 | 3,731,980 | `producers` 1123, DWARF 1121, `linking` 3, `target_features` 3 |
| `threads/libdlmalloc-mt.a` | 2 | 89,924 | 89,944 | DWARF 2, `producers` 2 |
| `threads/libdolly-process.a` | 7 | 49,578 | 49,932 | `producers` 7, `target_features` 1 |
| `threads/libdolly-runtime.a` | 1 | 16,608 | 16,612 | `producers` 1 |
| `threads/libstandalonewasm-mt-memgrow.a` | 15 | 91,230 | 91,380 | DWARF 15, `producers` 15 |

2,200 members in 21 files.

Member names and their order are the shipped ones in all 21. `llvm-nm`
prints the same lines for 19 of them (`try6-nm.out`); for the two libc
archives it prints ten fewer, the DWARF section symbols of the three assembly
members. `try2` to `try5` built Emscripten's full libc archives, 1,016 and
1,139 members, and held them against the container's: the 22 members Dolly
removes differ from the container's in the same two ways only
(`try5-compare.out`).

`demos/sysroot/test/sysroot.artifacts.mjs` (`npm run test:artifacts`) keeps
this comparison: it holds every file the seed ships in
`/usr/lib/dolly/process` (all but the builtins, which `llvm-runtimes` has)
against the image: the same members in the same order, 2,200 of them, and
each equal section by section, allowing `producers` and DWARF, and for the
assembly members `target_features` and `linking`. It passes on `try6` and
fails on `try5` (the member lists) and on `try3` (empty client archives).

Every member has the name, order, code, data, types, imports, relocations and
symbols of the shipped one. What differs, and why:

- `producers`, in every compiler-made member: the two Clang 24 builds of
  commit `4bfd08c2` spell their repository `https:/github.com/llvm/llvm-project`
  (container) and `https://github.com/llvm/llvm-project.git` (Dolly), five
  bytes.
- `.debug_info`, `reloc..debug_info`, `.debug_str`, in the members built with
  `-g`: the same string again, as `DW_AT_producer`. It is the first string, so
  every later string offset moves by five. `dwarf-check.py` proves it for each
  of the 2,159 (`try6/dwarf-check.txt`): the relocations agree in type, place
  and symbol, each differing addend names the same string on both sides,
  `.debug_info` is equal outside those four-byte fields and the string lists
  are equal without the producer.
- The assembly members (below): code, types, imports and code relocations are
  equal; they lack the assembler's line tables (`.debug_abbrev`, `.debug_info`,
  `.debug_line`, `.debug_aranges`, `.debug_ranges`) with their section symbols
  in `linking`, and carry the compiler's `producers` and its `target_features`
  (the unit's features where the assembler wrote none, or, for the two
  bulk-memory units, where the source declares exactly `+bulk-memory`).

### What the driver lacked

- An assembler. `cc` preprocesses `.S` and then refuses real assembly
  (`run_frontend`, "WebAssembly assembly is unsupported"). Members that need
  it: in `libc-ww.a` and `libc-mt.a` `emscripten_thread_state.o`
  (`pthread/emscripten_thread_state.S`), `emscripten_memcpy_bulkmem.o` and
  `emscripten_memset_bulkmem.o` (`libc/*.S`); in the builtins `stack_ops.o`,
  `stack_limits.o`, `__c_longjmp.o` (`.S`) and `emscripten_tempret.o` (`.s`);
  of Dolly's own `threads-start.o` (`src/process/threads-start.S`) in
  `threads/libdolly-process.a`. No other archive of the sysroot has one. The
  recipe wraps the preprocessed text in a file-scope `__asm__`, which the
  embedded assembler takes; that cannot give the line tables, and it fails
  outright on a unit that writes its own `target_features` section (`ar`: "target
  features section ended prematurely", the compiler adds a second one), so the
  recipe deletes that section from the two bulk-memory units.
  The smallest honest support: where `run_frontend` now refuses, hand the text
  to LLVM's MC assembler as Clang's `cc1as` does (target `MCAsmParser` into an
  object streamer, the unit's features, DWARF for the source under `-g`). It
  adds no library: `LLVMWebAssemblyAsmParser` is linked and initialised
  already, which is why file-scope asm works. Not added here.
- The `dl` names. `cc` passes `-Ddlopen=dolly_dlopen` and three more to every
  program, so libc's own `dlclose.o`, `dlerror.o`, `dlsym.o` and
  `emscripten_libc_stubs.o` came out defining `dolly_dlclose` and so on (the
  first comparison showed those seven members, three in each libc and one in
  `libstubs`, with six more bytes of `linking`). The recipe passes `-U` for
  the four names.
- `-fno-inline-functions`: not a `cc` option (unknown options are refused), so
  it goes through `-Xclang`.
- Building without Wasm exceptions, and for `libstubs` without atomics: `cc`
  always enables both features and each member's `target_features` lists them,
  so the recipe removes them with `-Xclang -target-feature`. Emscripten's
  DWARF 4 `-g` also goes through `-Xclang`, as for libc++.
- `__EMSCRIPTEN_PTHREADS__`: `cc` undefines it for programs; the `-mt`
  variants define it again, with `__EMSCRIPTEN_SHARED_MEMORY__` as `emcc` does.
- Visibility: the container's `cc1` line for Dolly's own parts has
  `-fvisibility=hidden` (`cc1-own.txt`) where `cc` passes `default`; the
  recipe passes `hidden`.
- Not a gap after all: Emscripten selects its JavaScript `setjmp` model for
  these and `cc` cannot; `cc` always passes the vectorizer flags and `emcc`
  at `-O1` does not. Every code section is equal all the same.

### Rows for `docs/sources.md` once adopted

The first row of the exceptions table stays (the first link needs a libc and
its builtins, the container builds the kernel and the seed). Adoption means
the root recipe builds these from source after that first link, as it does
libc++ on this branch, and the table gains:

| Component | Built outside Dolly | Result |
| --- | --- | --- |
| musl libc, dlmalloc, standalone glue, stubs (Emscripten 6.0.8 `system/lib`) | The container's archives, in the seed for the links before the root recipe has built its own | `Dollyfile-system-build` compiles the same pinned sources with Emscripten's flags and replaces them; equal code and data, the unit list generated from `tools/system_libs.py` |
| compiler-rt builtins | The same | The same, from `system/lib/compiler-rt` |
| Dolly's `crt1.o`, `libdolly-process.a`, host clients | Compiled by `emcc` in `scripts/build.sh` for the same first links | Rebuilt by the root recipe from `src/process` and `host/*/client.c` |
| Eight assembly sources (three of libc, built for each variant; four of the builtins; `threads-start.S`) | Assembled by the container's Clang | Stay the container's until `cc` assembles; file-scope asm reproduces their code but not their line tables |

and the paragraph on staged sources adds libc's (`dist/static/sysroot/sources.tar`
or its successor) to "staged with their `__EMSCRIPTEN__` tests renamed".
Adoption also has to keep what Dolly does to the container's libc today: the
six and sixteen members it removes, and `dynamic-provider.symbols`, which
`prepare-process-sysroot.sh` lists from the container's archives (`llvm-nm`
prints the same names for the rebuilt ones).

### In Chromium and Firefox

`demos/sysroot/test/sysroot-browser.mjs`: a session of `system` with the
`sysroot` package installed links a C program (stdio, `malloc`, `sqrt`,
`timegm`) and a `-pthread` one twice, as usual and with `-L/usr/lib/sysroot`
(`-L/usr/lib/sysroot/threads` first for the threaded one), so that every `-l`
name of the driver finds the rebuilt archive. The linker's trace shows the
usual link loading members of the seed's archives and the other loading none
of them, and the two executables are the same bytes; the serial one runs.
`crt1.o` and `libdolly-process.a` are linked by path and stay the seed's in
both. Chromium 5.0 s, Firefox 10.0 s (`browser/run2.log`).

With Emscripten's full `libc-mt.a` the threaded link failed, seven duplicate
symbols between its `pthread_create.o` and Dolly's `threads.o`
(`browser/run1.log`): that is why the recipe now leaves out the members the
seed's archives lack, a second copy of the two lists in
`scripts/prepare-process-sysroot.sh` and `scripts/build-process-threads.sh`
which the artifact test holds to the seed's.

### Not done

The assembler is not added. The threaded program is linked, not run (the probe
session has no `threads@0`). The image builds in Chrome only, as every image
does. The artifact test needs the `sysroot` image beside the seed it was built
on; the scratch comparison reads this worktree's `dist` and `.cache`.
