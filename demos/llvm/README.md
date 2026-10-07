# LLVM

LLVM 24, Clang and LLD built inside Dolly from the seed's pinned sources
(`tasks/20260930-232236-llvm-in-dolly`). So far: the TableGen stage.

## Images

- `llvm-tablegen`: build-only. CMake configures the tree inside Dolly; Make
  builds `llvm-min-tblgen`, `llvm-tblgen` and `clang-tblgen` and runs the
  TableGen targets the seed compiler's libraries need. It keeps the three tools
  and `/usr/share/llvm-tablegen` (configured headers and TableGen outputs).
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
