# LLVM

LLVM 24, Clang and LLD built inside Dolly from the seed's pinned sources
(`tasks/20260930-232236-llvm-in-dolly`): the compiler the host builds as the
seed, built again by Dolly's own `cc`. The seed stays the bootstrap.

## Images

- `llvm-tablegen`: build-only. CMake configures the tree inside Dolly; Make
  builds `llvm-min-tblgen`, `llvm-tblgen` and `clang-tblgen` and runs the
  TableGen targets the seed compiler's libraries need. It keeps the three tools
  and `/usr/share/llvm-tablegen` (configured headers and TableGen outputs).
- `llvm-build`: build-only: the seed compiler's libraries, compiled in Dolly.
  It configures the tree again with those tools and compiles the closure
  (Clang, LLD, the WebAssembly backend: 2,559 units) at four jobs. It keeps
  `/usr/lib/llvm-build`: the archives, Clang's resource directory and the
  configured and generated headers.
- `llvm-cc`: a shell whose `cc` and `c++` are the compiler built in Dolly.
  It compiles the seed's driver (`src/compiler.cpp`), links the compiler from
  those archives, requires the same bytes from it as from the seed compiler
  for two programs and a sample of LLVM's sources, and installs it for `cc`,
  `c++`, `ld` and `ar`.
- `llvm`: the compiler built in Dolly, as a package: `llvm-cc` and `llvm-c++`.
- `llvm-runtimes`: build-only. libc++, libc++abi, libunwind and the compiler-rt
  builtins built by Dolly's `c++` and `cc` from the pinned Emscripten sources,
  with the flags of the archives the seed ships. A link takes them instead of
  those with `-L/usr/lib/llvm-runtimes`; `test/llvm-browser.mjs` compares both
  links.

Key files: [`Dollyfile-llvm-tablegen`](Dollyfile-llvm-tablegen),
[`prepare-sources.sh`](prepare-sources.sh) (stages the seed's verified checkout
without tests or docs) and [`llvm-host-triple.patch`](llvm-host-triple.patch)
(LLVM runs `config.guess` even when given `LLVM_HOST_TRIPLE`). CMake comes from
[`cmake`](../cmake/README.md) and the Python 3 its configure requires from
[`python`](../python/README.md).

## Using the compiler

The compiler built here is a second compiler beside the seed's. It replaces
nothing: every other image still starts from the host-built seed.

- In a session, `amy install llvm` adds `llvm-cc` and `llvm-c++`. They take
  the arguments of `cc` and `c++` and use the same headers and libraries (the
  package installs `cc` for them), and give the seed compiler's bytes for the
  same arguments and output path.
- Or open the `llvm-cc` image (`/llvm-cc/`): there `cc`, `c++`, `ld` and `ar`
  themselves run it.

[`test/llvm-browser.mjs`](test/llvm-browser.mjs) checks both in Chrome and
Firefox.

## Reproducing it

`node demos/llvm/test/stage2-browser.mjs` runs `llvm-build`'s rows again in the
`llvm-cc` image, so with the compiler built there, and requires every archive,
the compiler and the TableGen tools to be the first stage's bytes. It takes
about 50 minutes and 7 GB in Chrome and runs on demand: the catalog builds no
second stage.

## Limits

Clang recurses on the browser's stack, which a page cannot size (Chrome
gives a process about 950 KB, `src/process-supervisor.mjs`). Two of LLVM's own
sources come close. `MSP430.cpp` chains 635 member calls: about 760 fit in
Chrome and 700 in Firefox 155. `SemaARM.cpp` includes 6,020 consecutive `case`
labels, which `-Wimplicit-fallthrough` walks recursively: under 4,000 fit, so
the build is configured with `LLVM_ENABLE_WARNINGS=OFF`. A program past
either limit fails explicitly: `dolly: process N failed: Maximum call stack
size exceeded` (Firefox: `too much recursion`) and status 126, with the shell
intact.

The closure has been built in Chrome only, which is what builds images; the
built compiler runs in Firefox too. [Browser stack](../../docs/browser-stack.md)
has the measurements and the reason Firefox is entered differently.
