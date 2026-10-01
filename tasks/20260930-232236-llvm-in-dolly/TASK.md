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
- Serial processes: the total only becomes practical with parallel build
  jobs (`20260930-231102-parallel-rust`).
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
