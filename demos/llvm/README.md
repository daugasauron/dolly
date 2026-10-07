# LLVM

LLVM 24, Clang and LLD built inside Dolly from the seed's pinned sources
(`tasks/20260930-232236-llvm-in-dolly`). So far: the TableGen stage and the
compiler's libraries.

## Images

- `llvm-tablegen`: build-only. CMake configures the tree inside Dolly; Make
  builds `llvm-min-tblgen`, `llvm-tblgen` and `clang-tblgen` and runs the
  TableGen targets the seed compiler's libraries need. It keeps the three tools
  and `/usr/share/llvm-tablegen` (configured headers and TableGen outputs).
- `llvm-build`: build-only. Configures the tree again with those tools and
  compiles the seed compiler's closure (Clang, LLD, the WebAssembly backend:
  2,559 units) at four jobs. It keeps `/usr/lib/llvm-build`: the archives,
  Clang's resource directory and the configured and generated headers.

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
labels, which `-Wimplicit-fallthrough` walks recursively: about 4,000 fit, so
the build is configured with `LLVM_ENABLE_WARNINGS=OFF`. A program past
either limit fails explicitly: `dolly: process N failed: Maximum call stack
size exceeded` (Firefox: `too much recursion`) and status 126, with the shell
intact.
