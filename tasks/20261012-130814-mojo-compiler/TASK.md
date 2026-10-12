# Build the Mojo compiler inside Dolly

- STATUS: CLOSED
- PRIORITY: 340
- TAGS: toolchain,mojo,llvm,demo

Owner (2026-10-12): "I want you to try your best to compile the mojo compiler
inside dolly. Ideally in an image with WebGPU where mojos DeviceContext works
for GPU compute."

Done when: an image whose recipe compiles the Mojo compiler from pinned source
inside Dolly and runs `mojo`; what a Mojo program needs to run there is
[the other task](../20261012-130814-mojo-programs/TASK.md).

## Result (2026-10-13)

Done. The `mojo` image holds the compiler that `mojo-build` compiled and
linked inside Dolly from pinned source (`mojo-llvm` before it: LLVM, MLIR,
Clang's Basic library and Zstandard, also compiled inside Dolly), with the
other task's targets and runtime. `node demos/mojo/test/mojo-browser.mjs`
with `DISPLAY=:141` (04:12, with `demo/mojo-target` merged at its final
`cd2326fe`, after `mojo-build` and `mojo` were rebuilt with it: `make -k -j3`
583 s; 03:57 with it at `59a520c6`, 03:40 at `95ba9c00`, 03:23 at `0cfaddd0`, 03:05 at `9558491e`, 02:39 at `c2918333`,
02:22 at `35771eb3`):

| Browser | Adapter | Result |
| --- | --- | --- |
| Chrome 151.0.7922.71 headless | SwiftShader | passed |
| Chrome 151.0.7922.71 on Xvfb, Vulkan | NVIDIA (`nvidia blackwell`) | passed |
| Firefox 157.0.1 on Xvfb | unnamed WebGPU adapter | passed |

In each, `mojo build NAME.mojo` in the session compiles and links ten
programs that then run: hello, the standard library (`library`), coroutines
(`tasks`), five with kernels that `DeviceContext` launches on WebGPU
(`saxpy`, `kernels`, `mandelbrot`, `output`, whose kernel prints and fails
an assertion, and `shared`, with shared memory and barriers) and upstream's own two GPU hellos (importing `gpu.host`
for `max.gpu.host`): `hello_writing.mojo` prints `GPU responded: 👋, 🔥` and
`gpu_hello.mojo`, whose kernel prints, `Hello from the GPU`; an object links
with `cc`; a package
precompiled there is imported; a type error and `mojo run`/`mojo repl` fail
with status 1. Playwright's headless Firefox offers no GPU adapter, and the
image requires `gpu@0`, so Firefox is tested on a display.

Measured in the image (Chrome 151 headless): `mojo build hello.mojo` 4.4 s,
again 0.7 s from the cache in `~/.cache/modular`; the executable is 29,720
bytes. What does not work and how it fails is in `demos/mojo/README.md`.

Final builds (02:05 to 02:20, machine otherwise idle): `mojo-llvm` `make`
2,529 s, image 2,683 s, 731.5 MB; `mojo-build` `make -k -j3` 680 s, image
755 s, 831 MB, 6.2 GB of anonymous memory at most in a 9 GB slot; `mojo`
38 s in a 6 GB slot (4.7 GB anonymous while it copies out of `mojo-build`'s
snapshot), 252 MB.

The image greets with two commands and holds three of the target's test
programs in `~/mojo`; `mojo build mandelbrot.mojo && ./mandelbrot` there
prints the set, computed by a kernel on WebGPU (02:47, Chrome headless). The
test passed again in the three browsers with them (02:45).

Not done, and not filed: `mojo build --print-supported-targets` lists
nothing. The package asked for after the merge is below.

Worked on branch `demo/mojo` (worktree `work/mojo`, commits `319c3a34` to
`3c8efe02`, then `main` merged at `58d79184` in `d0189286`), night of
2026-10-12. Everything is in `demos/mojo`; scratch scripts and logs were in
`build/mojo-evidence/` and are not kept.

With `main` merged (no conflict, no pin changed, the chain plans as sixteen
reuses): `node --test 'test/*.test.mjs' 'demos/**/*.test.mjs'` passes (424),
the Mojo test passes again in the three browsers (04:26), and
`node test/amy-browser.mjs` passes in Chromium and Firefox (04:23) on a
catalog of `default`, `system`, the thirty packages its cases install and
`mojo`: 57 images, all reused. For that catalog this tree took from
`work/rust` what it lacked: the snapshots and packs of main's fifteen new
packages (hard links; their `-snapshot.mjs` copied) and the Rust chain's
sources (`build/rustc-port/{rust,toolchain,libc,libc-186,jobserver,llvm-source}`,
2.5 GB copied), which staging reads even when every image is a cache hit.
This branch adds no `PACKAGE`, so amy's list is main's.

To build and test it in a tree that has main's images, as run here (the
first build fetches the pinned sources into `.cache`, 2.6 GB):

```sh
DOLLY_IMAGE_JOBS=1 DOLLY_BUILD_IMAGES=mojo-llvm work/slot.sh bigbuild npm run image          # 45 to 77 minutes
DOLLY_IMAGE_JOBS=1 DOLLY_BUILD_IMAGES=mojo-build work/slot.sh bigbuild npm run image         # 13 minutes
DOLLY_IMAGE_JOBS=1 DOLLY_BUILD_IMAGES=mojo-runtime,mojo work/slot.sh build npm run image     # 1 minute
work/slot.sh browser npm run test:demos -- mojo                            # headless Chrome
DISPLAY=:NNN work/slot.sh browser node demos/mojo/test/mojo-browser.mjs    # also Chrome and Firefox on the GPU
```

## The package (2026-10-13, on main `1fd1bfea`)

`mojo-compiler` (`demos/mojo/Dollyfile-mojo-compiler`) is a `PACKAGE` of
`COPY` rows, as `rust` is: the compiler and `/usr/lib/mojo` out of
`mojo-build`, `libmojo-rt.a` and `libmojo-gpu.a` out of `mojo-runtime`,
`/etc/modular/modular.cfg` and the licences; it installs `cc`, through which
`mojo build` links. It declares `runtime@0` alone. Built in 23 s,
227,327,240 bytes. The name is upstream's for its package of the compiler
without the developer tools (`Mojo/docs/site/faq.md`: "two Mojo packages:
`mojo` and `mojo-compiler`"), which is what `docs/dollyfile.md` rules when an
application has the product's name.

The `mojo` application is now `gpu-sdk` and this package (35 s, 252,104,771
bytes): no `COPY` row and no configuration of its own. `mojo-llvm`,
`mojo-build` and `mojo-runtime` were not rebuilt, and no image input changed.

On `default` (Chrome 151 headless, 04:39): `mojo` and `cc` are absent;
`amy install mojo-compiler` reports 1,963 files and 226,779,725 bytes and the
commands `ar c++ cc ld make mojo`; `mojo build hello.mojo && ./hello` prints
`hello from mojo`. A program with a kernel (`saxpy.mojo`) builds and links
there with status 0, and starting it fails with status 126 and `dolly:
process 128 was refused: host module gpu@0 is not declared by this image
(REQUIRES HOST)`: `default` has no `gpu@0`, and a package cannot add one.

Tested (04:42 to 04:52): `node test/amy-browser.mjs` passes in Chromium and
Firefox with the case `amy mojo-compiler alone` (a fresh `default` without
`cc` and `mojo`; the install takes 1.9 s and 2.2 s; a hello is built and
run), on a catalog of 58 reused images; the Mojo test passes on the `mojo`
image that installs the package, in headless Chrome, Chrome on the NVIDIA
GPU and Firefox; the source suite with the demos' tests passes (424).
`config/domain-pages-images.txt` lists `mojo` and `mojo-compiler`. To build:
`DOLLY_IMAGE_JOBS=1 DOLLY_BUILD_IMAGES=mojo-compiler,mojo work/slot.sh build npm run image`.

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
  libraries, 134 TableGen commands, two executables). Bazel itself was
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

## Disk (2026-10-13)

The native check took 29 GB under `build/mojo-native` at its peak (two LLVM
build trees of 6.9 and 6.3 GB, three compiler trees of 2.6 GB). All of it is
deleted (02:43), and nothing native is needed to build the images. What
stays, 4.7 GB: the two pinned checkouts in `.cache` (`mojo-llvm-…` 2.5 GB,
`modular-…` 82 MB), the staged archives in `dist/static/mojo` (74 MB) and
four snapshots in `dist/` (`mojo-llvm` 731 MB, `mojo-build` 831 MB, `mojo`
252 MB, `mojo-runtime` 152 MB).

## The chain with Zstandard and the target's patches (2026-10-13)

- `mojo-llvm` again, with Zstandard and `wasm64-unknown-dolly` as the default
  target (01:06, Chrome): Zstandard's 30 units 5 s, configure 124 s, `make`
  3,048 s, image 3,237 s (54 minutes), snapshot 731.5 MB.
- `mojo-build` with `demos/mojo/target/patches` (01:17): `make -k -j3`
  596 s; `Mojo 1.1.0 (c6fa49f7+dolly.12975345)`; `mojo precompile` of the
  standard library 22.4 s and of the package `gpu` 1.2 s, in the recipe;
  image 673 s, snapshot 831 MB.
- `mojo` stopped in its own check: `mojo build hello.mojo` compiled, started
  `cc`, and reported `failed to link executable: Error waiting for child
  process: Not supported`. LLVM's `sys::Wait` always passes `wait4` a
  `rusage`; Dolly's `wait4` answers `ENOTSUP` to one
  (`src/process/libc-adapter.c`: it does not account children).
  `demos/mojo/llvm-wait.patch` makes LLVM wait with `waitpid` on Dolly and
  report no statistics; the third `mojo-llvm` has it, and the link works.
- Meanwhile, that `mojo` and `std.mojoc`, copied out of the snapshot into a
  `system` session with `libmojo-rt.a` (Chrome 151 headless):
  `mojo build --emit object hello.mojo` 5.1 s, `cc hello.o libmojo-rt.a -o
  hello`, `./hello` prints `hello from mojo`; `library.mojo` 7.8 s and prints
  `MOJO-LIBRARY 6 5 29 True 2 7.25 True`; `tasks.mojo` 4.3 s and prints
  `MOJO-TASKS 33 6`. No `--target-triple` was given. The first `mojo-build`'s
  binary ran the standard library's precompile to its last step in Chrome and
  in Firefox, 26 s in both.
- Memory: the scope's `memory.current` counts the file cache (about 1 GB
  while a 731 MB snapshot is served). With it, `mojo-build` at three jobs
  peaked at 8.96 GB of the 9 GB cap; its anonymous part in the next run was
  6.2 GB, and `mojo-llvm`'s 6.7 GB while its snapshot is taken.
