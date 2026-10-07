# LLVM

LLVM 24, Clang and LLD built inside Dolly from the seed's pinned sources
(`tasks/20260930-232236-llvm-in-dolly`): the compiler the host builds as the
seed, built again by Dolly's own `cc`. The seed stays the bootstrap.

## Images

- `llvm-tablegen`: build-only. CMake configures the tree inside Dolly; Make
  builds `llvm-min-tblgen`, `llvm-tblgen` and `clang-tblgen` and runs the
  TableGen targets the seed compiler's libraries need. It keeps the three tools
  and `/usr/share/llvm-tablegen` (configured headers and TableGen outputs).
- `llvm-build`: build-only. Configures the tree again with those tools and
  compiles the seed compiler's closure (Clang, LLD, the WebAssembly backend:
  2,559 units) at four jobs. It keeps `/usr/lib/llvm-build`: the archives,
  Clang's resource directory and the configured and generated headers.
- `llvm-cc`: compiles the seed's driver (`src/compiler.cpp`) and links the
  compiler from those archives, requires the same bytes from it as from the
  seed compiler for two programs and a sample of LLVM's sources, and installs
  it: `cc`, `c++`, `ld` and `ar` in this image run a compiler built in Dolly.
- `llvm-stage2`: build-only. Builds the closure and the compiler again with
  that compiler and requires every archive and the compiler to be the first
  stage's bytes.
- `llvm-runtimes`: build-only. libc++, libc++abi, libunwind and the compiler-rt
  builtins built by Dolly's `c++` and `cc` from the pinned Emscripten sources,
  as Emscripten's container builds them, DWARF included. The seed ships the
  container's builtins; `system-build` compiles the other three itself. A link
  takes these instead with `-L/usr/lib/llvm-runtimes`; `test/llvm-browser.mjs`
  compares both links.

Key files: [`Dollyfile-llvm-tablegen`](Dollyfile-llvm-tablegen),
[`prepare-sources.sh`](prepare-sources.sh) (stages the seed's verified checkout
without tests or docs) and [`llvm-host-triple.patch`](llvm-host-triple.patch)
(LLVM runs `config.guess` even when given `LLVM_HOST_TRIPLE`). CMake comes from
[`cmake`](../cmake/README.md) and the Python 3 its configure requires from
[`python`](../python/README.md).

## Limits

Clang recurses on the browser's stack, which a page cannot size (Chrome
gives a process about 950 KB, `src/process-worker.mjs`). Two of LLVM's own
sources come close. `MSP430.cpp` chains 635 member calls: about 760 fit in
Chrome and 700 in Firefox 155. `SemaARM.cpp` includes 6,020 consecutive `case`
labels, which `-Wimplicit-fallthrough` walks recursively: under 4,000 fit, so
the build is configured with `LLVM_ENABLE_WARNINGS=OFF`. A program past
either limit fails explicitly: `dolly: process N failed: Maximum call stack
size exceeded` (Firefox: `too much recursion`) and status 126, with the shell
intact.
