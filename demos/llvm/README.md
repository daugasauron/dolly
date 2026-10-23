# LLVM

LLVM 24, Clang and LLD built inside Dolly from the seed's pinned sources
(`tasks/20260930-232236-llvm-in-dolly`): the seed's compiler, built by the
seed's own `cc`.

## Images

- `llvm-tablegen`: a build stage. CMake configures the tree inside Dolly; Make
  builds `llvm-min-tblgen`, `llvm-tblgen` and `clang-tblgen` and runs the
  TableGen targets the seed compiler's libraries need. It keeps the three tools
  and `/usr/share/llvm-tablegen` (configured headers and TableGen outputs).
- `llvm-build`: a build stage: the seed compiler's libraries, compiled in Dolly.
  It configures the tree again with those tools and compiles the closure
  (Clang, LLD, the WebAssembly backend: 2,559 units) at four jobs. It keeps
  `/usr/lib/llvm-build`: the archives, Clang's resource directory and the
  configured and generated headers. Then, in the same tree, it builds the rest
  of LLVM and installs it under `/usr/lib/llvm` for the `llvm` package; the
  compiler's archives are kept before, so this leaves the compiler as it is.
- `llvm-cc`: a shell whose `cc` and `c++` are the compiler built in Dolly.
  On `llvm-tablegen`, with `llvm-build`'s `/usr/lib/llvm-build` copied, it
  compiles the seed's driver (`src/compiler.cpp`), links the compiler from
  those archives without its names (`-Wl,--strip-all`), requires the same
  bytes from it as from the seed compiler for two programs and a sample of
  LLVM's sources, and installs it for `cc`, `c++`, `ld` and `ar`.
- `llvm`: LLVM's tools (`llvm-objdump`, `llvm-nm`, `llvm-ar`, `opt`, `llc` and others), its libraries, headers and `llvm-config`, from the tree whose archives the seed's compiler links.
- `llvm-runtimes`: libc++, libc++abi, libunwind and the compiler-rt builtins as compiled in Dolly, in `/usr/lib/llvm-runtimes`; a link takes them with `-L`.
- `llvm21-tablegen`: a build stage: LLVM 21 with every default target, configured by CMake inside Dolly, and its TableGen tools.
- `llvm21`: LLVM 21 with every default target, Clang and LLD as libraries and headers, and `llvm-config`, in `/usr/lib/llvm21`: what Zig 0.16 links.

  libc++, libc++abi, libunwind and the compiler-rt builtins from the pinned
  Emscripten sources, as Emscripten's container builds them, DWARF included.
  The seed ships the container's builtins; `system-build` compiles the other
  three itself. A link takes these instead with `-L/usr/lib/llvm-runtimes`;
  `test/llvm-browser.mjs` compares both links.

Key files: [`Dollyfile-llvm-tablegen`](Dollyfile-llvm-tablegen),
[`prepare-sources.sh`](prepare-sources.sh) (checks out the pinned commit, applies
[`lld-dolly.patch`](lld-dolly.patch), with which a link without `-mllvm` leaves
LLVM's options as the compile set them, and stages the tree without tests or docs) and
[`llvm-host-triple.patch`](llvm-host-triple.patch) (LLVM runs `config.guess`
even when given `LLVM_HOST_TRIPLE`). CMake comes from
[`cmake`](../cmake/README.md) and the Python 3 its configure requires from
[`python`](../python/README.md).

## The seed's compiler

[`pin-seed-compiler.mjs`](pin-seed-compiler.mjs) makes the compiler `llvm-cc`
linked the seed's: it puts it and Clang's resource headers, as `llvm-build`
generated them, into the archive `npm run build:runtime` takes, and pins it in
`config/source-pins.sh` ([sources](../../docs/sources.md#the-seeds-compiler)).
Run it after building `llvm-cc`. A digest it leaves unchanged is the fixed
point, a compiler that rebuilt itself; a new one is a new seed, and every image
rebuilds.

## Using it

- `cc` and `c++` are this compiler in every image (the seed's). The `llvm-cc`
  image (`/llvm-cc/`) is the one that linked it.
- In a session, `amy install llvm` adds LLVM itself, with `cc`: the binary
  tools, `opt` and `llc` for IR, and the libraries, headers and `llvm-config`
  that a program building against LLVM uses (`man llvm`).

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
