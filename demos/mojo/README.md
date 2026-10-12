# Mojo

Modular's Mojo compiler (tag `mojo/v1.1.0`), built inside Dolly from pinned
source by Dolly's own `cc` and `c++` (`tasks/20261012-130814-mojo-compiler`).
Upstream builds it with Bazel for Linux and macOS; here CMake and Make build
the same sources from a `CMakeLists.txt` that
[`bazel-to-cmake.py`](bazel-to-cmake.py) prints from upstream's `BUILD.bazel`
files.

## Images

- `mojo-llvm`: build-only: the LLVM, MLIR and Clang Basic libraries the
  compiler links, at the revision Mojo pins, with Mojo's one patch to LLVM's
  code generator, and Zstandard. WebAssembly is the only backend. It keeps
  `/opt/mojo-llvm`: `llvm-tblgen`, `mlir-tblgen`, the archives and the headers.
- `mojo-build`: build-only: the compiler, compiled and linked from those
  archives with the target's patches, and the standard library and the
  package `gpu` that it precompiles. It keeps `/opt/mojo`.
- `mojo`: a shell with that compiler and `mojo-runtime`'s libraries:
  `mojo build NAME.mojo` makes a Dolly executable. Requires WebGPU.
- `mojo-runtime`: What a Mojo object links against, and its `DeviceContext` over WebGPU. Requires WebGPU.

Programs for Dolly, their runtime and GPU kernels: [target](target/README.md).

## Key files

- [`prepare-sources.sh`](prepare-sources.sh) stages LLVM's tree without tests
  or docs, and of Modular's repository the packages of the compiler's closure
  and the standard library; nothing of `max/`.
- [`bazel-to-cmake.py`](bazel-to-cmake.py) evaluates the `BUILD.bazel` files
  as Python, with the macros of `bazel/api.bzl` and
  `bazel/internal/tablegen.bzl` re-stated, and prints the closure of
  `//Mojo/tools/mojo:mojo`: a `cc_library` is an archive (its objects, where
  it is `alwayslink`), a `gentbl` rule is its TableGen commands.
- [`port/`](port) implements three of upstream's headers without what Dolly
  does not build: `Support/Telemetry` without OpenTelemetry's SDK and its
  OTLP exporters (nothing is collected or sent; every instrument is
  OpenTelemetry's no-op), `Support/CrashReporting` without Crashpad,
  `Support/BazelRunfiles` without Bazel. `port/tcmalloc/tcmalloc.h` is
  TCMalloc's three entry points over `memalign` and `free`.
- [`mojo-dolly.patch`](mojo-dolly.patch) is what the sources themselves need:

  | File | Why |
  | --- | --- |
  | `Support/PlatformUtils.h` | stops with `#error` unless the platform is Linux, macOS or Windows |
  | `Support/Threading/SpinWaiter.h` | stops with `#error` unless the processor is x86 or ARM; WebAssembly has no pause instruction |
  | `Support/ML/TensorShape.h` | `size_t` and `int64_t` are different types on wasm64, as on macOS |
  | `Support/lib/BinaryID.cpp` | reads the ELF build-id note of the running program, to key caches; a WebAssembly module has none and names itself by its revision, to which `mojo-build` adds the digest of its source archive |
  | `AsyncRT/Runtime/CPUDevice.h` | the default work queue starts threads; with an LLVM built without threads it is the one that runs on the caller's thread |
  | `AsyncRT/lib/Support/Semaphore.cpp` | `sem_timedwait`, which the libc of a process without threads does not have |
  | `Mojo/tools/mojo/Run/mojo-run.cpp` | `mojo run` executes through LLVM's JIT; it fails saying so |
