# Build the Mojo compiler inside Dolly

- STATUS: OPEN
- PRIORITY: 340
- TAGS: toolchain,mojo,llvm,demo

Owner (2026-10-12): "I want you to try your best to compile the mojo compiler
inside dolly. Ideally in an image with WebGPU where mojos DeviceContext works
for GPU compute."

## As filed

Nothing built. Read on 2026-10-12:

- Modular published the compiler and toolchain on 2026-08-18 under Apache-2.0
  with LLVM exceptions, in `github.com/modular/modular` (`Mojo/`, with
  `AsyncRT/`, `Support/`; `max/` has another licence and is not wanted here).
  The build is Bazel; Dolly has no Bazel and no JVM.
- It pins its own LLVM (`bazel/public-patches/llvm_source.bzl`, commit
  `a83a3a4e…` on 2026-10-12, with patches) and needs MLIR. Dolly's
  `llvm-build` compiles the seed's LLVM 24 (`4bfd08c2…`): Clang, LLD and the
  WebAssembly backend, no MLIR.
- Upstream lists Linux and macOS; `mojo build` has no WebAssembly output.

Done when: an image whose recipe compiles the Mojo compiler from pinned source
inside Dolly and runs `mojo`; what a Mojo program needs to run there is
[the other task](../20261012-130814-mojo-programs/TASK.md).
