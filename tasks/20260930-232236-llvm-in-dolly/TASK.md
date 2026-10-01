# Build LLVM, Clang and LLD inside Dolly

- STATUS: OPEN
- PRIORITY: 265
- TAGS: toolchain,bootstrap,llvm,core

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

## Decisions (2026-10-01, delegated)

- LLVM-in-Dolly stays a demo (`demos/llvm`): moving CMake and Python into core
  would grow the core, against the owner's direction.
- The Worker stack overflow on `MSP430.cpp`/`SemaARM.cpp` is fixed on the
  compiler side (measure the recursion, reduce frame use or recursion depth),
  not by patching Clang's sources.
