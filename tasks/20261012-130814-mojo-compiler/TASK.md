# Build the Mojo compiler inside Dolly

- STATUS: OPEN
- PRIORITY: 340
- TAGS: toolchain,mojo,llvm,demo

Owner (2026-10-12): "I want you to try your best to compile the mojo compiler
inside dolly. Ideally in an image with WebGPU where mojos DeviceContext works
for GPU compute."

Done when: an image whose recipe compiles the Mojo compiler from pinned source
inside Dolly and runs `mojo`; what a Mojo program needs to run there is
[the other task](../20261012-130814-mojo-programs/TASK.md).

Worked on branch `demo/mojo` (worktree `work/mojo`), night of 2026-10-12.
Everything is in `demos/mojo`; scratch scripts and logs were in
`build/mojo-evidence/` and are not kept.

## Sources (2026-10-12)

- Mojo: tag `mojo/v1.1.0` of `github.com/modular/modular`, commit
  `c6fa49f712fe15c99d0461ad2baaf2a15cbc58ce` (`DOLLY_MODULAR_*`). Fetched
  sparsely (`scripts/fetch-pinned-checkout.sh`): `Mojo`, `AsyncRT`, `Support`,
  `Cache`, `Config`, `Init`, `bazel`, `Licenses`; `max/` is never checked out.
- LLVM: at that tag `bazel/public-patches/llvm_source.bzl` pins
  `4154b56ccc70220dca3fa1226fc8a24bafd90ac3` (2026-09-04), 2,381 commits after
  the seed's `4bfd08c2…` (2026-08-19). Of its five patches only
  `llvm-machinefunction-sti-ref-to-ptr.patch` touches what is built here; three
  change LLDB and one the Bazel overlay.
- Besides LLVM, the closure of `//Mojo/tools/mojo:mojo` names (evaluated from
  the `BUILD.bazel` files, 174 rules, 353 `.cpp`):

  | Dependency | Used by | Here |
  | --- | --- | --- |
  | `@llvm-project//llvm`, `//mlir` | everything | built in Dolly, `mojo-llvm` |
  | `@llvm-project//clang:basic` | `Support:MArchTarget` (`clang::TargetInfo` for CPU features), `mojo build` | built in Dolly, `mojo-llvm` |
  | `@fmt` 11.2.0 | `Support:Log` | compiled (`format.cc`) |
  | `@xxhash` 0.8.3 | `Support:HashUtils`, `Mojo:Support`, `Mojo:Compiler` | compiled (`xxhash.c`) |
  | `@opentelemetry-cpp` 1.19.0 (SDK, OTLP exporters over HTTP and protobuf) | `Support:Telemetry` | configured out: `port/Telemetry.cpp` gives every instrument OpenTelemetry's own no-op; only its headers are staged |
  | `@crashpad` | `Support:CrashReporting` | configured out: `port/CrashReporting.cpp` |
  | `@rules_cc//cc/runfiles` | `Support:BazelRunfiles` | configured out: `port/BazelRunfiles.cpp` |
  | `@tcmalloc` (gperftools on macOS) | `AsyncRT:RuntimeGlobals` | `port/tcmalloc/tcmalloc.h`: its three entry points over `memalign`/`free` |
  | `@tracy` | optional (`//:tracy_enabled`) | off, as upstream's default |
  | `//MLRT` (accelerator runtime) | `internal_deps` | not in the public repository; `bazel/api.bzl` drops them and sets `MLRT_ACCELERATOR_SUPPORT=0` |

  LLDB (`MojoLLDB`, `mojo debug`'s server), Jupyter, the language server and
  the Python bindings are outside this closure and are not built.

## Decisions

- **Own LLVM, not the seed's.** `llvm-build` keeps archives and headers of
  Clang's closure only: no MLIR, no ORC, no CMake package to build MLIR
  against, and a snapshot's Make tree cannot continue. Mojo is written
  against its pin, 2,381 commits later. `mojo-llvm` therefore configures
  Mojo's LLVM once with `clang;mlir` and builds what the closure needs: 2,274
  units (LLVM 1,871, MLIR 305, Clang's Basic 98) against `llvm-build`'s 2,559.
  Not tried: compiling Mojo against the seed's revision.
- **The build graph is read from upstream's `BUILD.bazel` files** by
  `demos/mojo/bazel-to-cmake.py`, which runs in Dolly's Python and prints one
  `CMakeLists.txt`: Starlark's BUILD dialect is evaluated as Python with the
  macros of `bazel/api.bzl` and `bazel/internal/tablegen.bzl` re-stated (69
  object libraries, 134 TableGen commands, two executables). Bazel itself was
  not run.
- **WebAssembly is the only LLVM backend.** Upstream ships AArch64, RISC-V
  and X86; none of their output runs in Dolly.
- **LLVM without threads**, as the seed and `rust-llvm`: MLIR then runs its
  passes inline, and AsyncRT has a work queue that uses only the caller's
  thread (`--workqueue=single-thread`).
- **`MLIR_USE_FALLBACK_TYPE_IDS` is not defined.** Bazel's toolchain defines
  it for every unit, LLVM's included, because upstream links several shared
  libraries; it only switches `MLIR_DECLARE_EXPLICIT_TYPE_ID`. Here both
  LLVM and Mojo are compiled without it into one executable.

## Measured natively first (2026-10-12)

The host has no Clang; Zig 0.16's bundled Clang 21 (`zig c++`, libc++) built
everything below, each run in a `systemd-run` scope capped at 8 GB.

- **The graph is right.** The staged LLVM tree configures and builds (3,576
  steps with X86 added for the host), the generated `CMakeLists.txt` builds
  all 348 units, and `mojo` links: `Mojo 1.1.0 (c6fa49f7)`.
  `mojo precompile` of the standard library takes 12.7 s and 510 MB and writes
  a 3.2 MB `std.mojoc`; `mojo build --emit llvm hello.mojo` takes 2.0 s and
  317 MB; `--emit object` writes an x86-64 object.
- **Bazel's link order matters.** `Mojo:Compiler` (`SaveAsmOutput.cpp`) and
  `Mojo:Support` (`FileUtils.cpp`) both define
  `M::KGEN::writeBytesToTempWithHash`. Linking every object gives `duplicate
  symbol`; so does listing the archives dependencies-first. Bazel lists a
  library before what it depends on, and the linker then never loads the
  second definition: the generator does the same.
- **LLVM needs Zstandard.** `MojoPrecompiledFile.cpp` calls
  `llvm::compression::zstd::compress`; with `LLVM_ENABLE_ZSTD=OFF` that is
  `llvm_unreachable` and `mojo precompile` ends in SIGTRAP. Upstream's Bazel
  build always gives LLVM zstd. `mojo-llvm` compiles Zstandard 1.5.7 and
  configures LLVM with it.
- **The program reads its own ELF build-id** (`Support/lib/BinaryID.cpp`, for
  cache keys); without `-Wl,--build-id` the native `mojo build` crashes there.
  A Wasm module has no such note: see the patch.
- **Heavy units** (peak RSS, Clang 21, x86-64): MLIR's `ROCDLDialect.cpp`
  includes 193,313 generated lines and takes 5.1 GB at `-O3` (4.8 GB at
  `-O0`, 2.0 GB to parse only), `LLVMDialect.cpp` over 3.4 GB,
  `GPUDialect.cpp` 1.6 GB. Two of them at once exceeded the 8 GB cap three
  times. Mojo's own heaviest at `-O1`: `Elaborator.cpp` and
  `ParametricElaborator.cpp` 1.9 GB, `Canonicalizer.cpp` 1.5 GB (they include
  every dialect), `KGENAttrs.cpp` 1.2 GB; 341 of 348 units stay under 1 GB.
- **Dolly's headers, checked before any image existed.** Every compile
  command of the native build was repeated with `zig clang
  --target=wasm64-unknown-emscripten`, Dolly's include tree (Emscripten's
  sysroot headers with `__EMSCRIPTEN__` renamed), `-U__EMSCRIPTEN__
  -D__dolly__=1` and an `llvm-config.h` without threads. First run: 150 of 353
  units failed, from five causes (`PlatformUtils.h` and `SpinWaiter.h` stop
  with `#error`, `TensorShape.cpp`, OpenTelemetry's `nostd` types, Clang's
  generated headers not yet built). With the patch: 0 of 353, and all 353
  also compile to wasm64 objects. Their undefined C symbols that Dolly's
  process sysroot (6,232 defined symbols) lacks: none after the patch;
  before it, `sem_timedwait`.

## Built in Dolly

`mojo-llvm` (2026-10-12, Chrome, one `bigbuild` slot, without Zstandard yet):
configure 202 s, `make -k -j4` of the fifteen goals 4,322 s, whole image
4,617 s (77 minutes); snapshot 731 MB; the browser peaked at 5.8 GB. No unit
failed. ORC, JITLink, MCJIT, MLIR and Clang's Basic library had not been
compiled in Dolly before. `ROCDLDialect.cpp` and `NVVMDialect.cpp` compile
while little else does, because a top-level Makefile runs its goals one after
another: the browser held 5.4 GB then.

`mojo-build`, first run (2026-10-13 00:07, Chrome, against that `mojo-llvm`,
without the target's patches): the generator ran in Dolly's Python, CMake
configured in 7 s, `make -k -j3` compiled and linked in 855 s, the whole image
took 922 s. No unit failed and the link had no undefined symbol. `mojo` is
95,654,254 bytes and printed `Mojo 1.1.0 (c6fa49f7)` in the recipe. In a
session (`system` plus that file, Chrome 151 headless): `mojo --version`
prints the same; `mojo build h.mojo` parses and stops at `unable to locate
module 'std'` (none was installed); `mojo run h.mojo` fails with ``error:
`mojo run` compiles and executes a program in one process, which WebAssembly
does not allow; build it with `mojo build` `` and status 1; `mojo` and `mojo
repl` fail with upstream's `unable to resolve the lldb path`. The browser
held under 7.3 GB while compiling.

## The Dolly configuration, measured natively (2026-10-13)

A second native LLVM as `mojo-llvm` configures it (no threads, Zstandard) and
the compiler from the tree with both patch sets (this task's and
`demos/mojo/target/patches`): `mojo precompile` of the standard library 12.8 s
and 399 MB; `mojo build --target-triple wasm64-unknown-dolly --emit object
hello.mojo` 2.5 s and 171 MB, a 3,534 byte Wasm object, the same bytes twice.
`strace -f` counts no `clone` in that build and 15 in the build with threads:
the single-thread work queue is the default and nothing starts a thread.

## Disk (2026-10-13 00:30)

The native check took 29 GB under `build/mojo-native` at its peak (two LLVM
build trees of 6.9 and 6.3 GB, three compiler trees of 2.6 GB). The finished
trees are deleted; 6.8 GB remain (one LLVM as headers and archives, one
compiler tree) and nothing more is to be built natively. The images add
about 4 GB of snapshots to `dist/` (`mojo-llvm` 731 MB, `mojo-build` under
1 GB, each built twice tonight).
