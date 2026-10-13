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
- `mojo`: the Mojo compiler built in Dolly, with its standard library, the package `gpu` and the `cc` package: `mojo build NAME.mojo` makes a Dolly executable.
- `mojo-gpu`: a shell that installs `mojo` in an image that declares `gpu@0`,
  where the kernels of its programs run. Requires WebGPU.
- `mojo-runtime`: What a Mojo object links against, and its `DeviceContext` over WebGPU. Requires WebGPU.

Programs for Dolly, their runtime and GPU kernels: [target](target/README.md).

## Using it

Open the `mojo-gpu` image (`/mojo-gpu/`). `~/mojo` holds three programs:

```sh
cd ~/mojo
mojo build hello.mojo && ./hello
mojo build mandelbrot.mojo && ./mandelbrot    # the set as text, from a kernel on the GPU
```

In another image, `amy install mojo` brings the compiler, its libraries and
`cc` (1,963 files, 227 MB), and `mojo build hello.mojo && ./hello` works
there, on `default` too. The package has the plain name, as what a session
installs; the image that opens into it is named for what it adds, the GPU.
The package declares `runtime@0` alone: a program that imports `gpu` builds
and links anywhere, and where the image has no `gpu@0`, as on `default`,
starting it fails with status 126 and `dolly: process 128 was refused: host
module gpu@0 is not declared by this image (REQUIRES HOST)`. Its kernels run
in the `mojo-gpu` image.

- `mojo build` compiles for Dolly when given no `--target-triple`
  (`wasm64-unknown-dolly` is this LLVM's default target) and links with `cc`
  against `libmojo-rt.a`; a program that imports `gpu` gets `libmojo-gpu.a`
  and Dolly's GPU library from the same link. The package's
  `/etc/modular/modular.cfg` says so. `--emit object`, `llvm`, `llvm-bitcode` and `asm` write those files.
- `mojo precompile -o NAME.mojoc DIRECTORY` makes a package; `-I` finds it.
  `std` and `gpu` are in `/usr/lib/mojo`, precompiled by `mojo-build`.
- `mojo doc` and `mojo demangle` run.
- Hello builds in 4.4 s and, from the cache in `~/.cache/modular`, again in
  0.7 s; the standard library precompiles in 22 s (Chrome 151).

What does not work, and how it says so:

- `mojo run NAME.mojo` and `mojo NAME.mojo` execute through LLVM's JIT, and a
  WebAssembly process cannot execute code it generates: ``error: `mojo run`
  compiles and executes a program in one process, which WebAssembly does not
  allow; build it with `mojo build` ``.
- `mojo`, `mojo repl` and `mojo debug` start LLDB, which is not built:
  `unable to resolve the lldb path`. `mojo format` starts the Python
  formatter `mblack`, which is not installed: `unable to resolve Mojo
  formatter in PATH`.
- Another target: `No available targets are compatible with triple
  "x86_64-unknown-linux-gnu"`. This LLVM has the WebAssembly backend only.
  `mojo build --print-supported-targets` lists none, the two it has included.
- The compiler runs on one thread (LLVM is built without threads, as Dolly's
  other LLVMs are), and it sends no telemetry and no crash reports.

Test: `npm run test:demos -- mojo` ([`test/`](test/)) builds and runs ten
programs in the image, seven of them with kernels on WebGPU; with a GPU
window on `DISPLAY`, `node demos/mojo/test/mojo-browser.mjs` runs it in
Chrome on the GPU and in the installed Firefox too. `test/amy-browser.mjs`
installs `mojo` alone into `default`, where the command and `cc` are
absent, and builds and runs a hello.

## Building it

`npm run image -- mojo-gpu` builds the chain: `mojo-llvm` takes 45 to 77 minutes
at four jobs and `mojo-build` 13 minutes at three, each in a 9 GB slot
(`mojo-llvm`'s `ROCDLDialect.cpp` alone takes a compiler about 5 GB natively;
`mojo-build` held 6.2 GB of anonymous memory), `mojo` and `mojo-gpu` under
a minute each.

## Key files

- [`prepare-sources.sh`](prepare-sources.sh) stages LLVM's tree without tests
  or docs, and of Modular's repository the packages of the compiler's closure
  and the standard library; nothing of `max/`.
- [`llvm-wait.patch`](llvm-wait.patch): LLVM waits for a child with `wait4`
  and a usage record, which Dolly's `wait4` refuses; `mojo build` runs `cc`
  through it. `mojo-llvm` applies it with the two LLVM patches of the `llvm`
  and `rust` demos.
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
