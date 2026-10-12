# Mojo programs that run in Dolly: target, runtime, standard library, and DeviceContext over gpu@0

- STATUS: OPEN
- PRIORITY: 335
- TAGS: toolchain,mojo,gpu,demo

Owner (2026-10-12): "Ideally in an image with WebGPU where mojos DeviceContext
works for GPU compute." The compiler itself is
[its own task](../20261012-130814-mojo-compiler/TASK.md).

## As filed

Nothing built or measured. A compiler that runs in Dolly is useful once what
it compiles runs in Dolly, which upstream does not offer:

- the code generator has to emit wasm64 objects that Dolly's `ld` links
  against the process sysroot;
- the runtime a Mojo program links (`Mojo/lib/CompilerRT`, `AsyncRT`,
  `Support`) has to compile for Dolly;
- the standard library has to build for a target that is neither Linux nor
  macOS, and may not claim to be either;
- `mojo run` and the REPL execute through a JIT, which Wasm does not have;
- `gpu.host.DeviceContext` has CUDA, HIP and Metal behind it. Dolly's GPU is
  `gpu@0`: WGSL shaders and compute pipelines brokered by the page
  (`docs/gpu.md`).

Done when: a Mojo program compiled for Dolly runs in a session, and what
stands between `DeviceContext` and `gpu@0` is either built or measured and
written here.

## Measured 2026-10-12 (night), source `mojo/v1.1.0` of `github.com/modular/modular`

Working copies are under `build/mojo-target/` (not committed): `modular/` is
the tag with the patches of `demos/mojo/target/patches/` applied, `venv/` the
released `mojo` 1.1.0 from PyPI.

- **The released compiler cannot target Wasm.** `mojo build
  --print-supported-targets` lists AArch64, RISC-V and X86 only;
  `--target-triple wasm64-unknown-unknown` fails with "No available targets
  are compatible". The backends are the list `BACKENDS` in
  `bazel/public-patches/llvm_project.bzl`; a target is three self-registering
  files (`Mojo/lib/Target/NAME/`, `Mojo/lib/KGENToLLVM/Target/NAME/`,
  `Mojo/lib/Compiler/ObjectCompiler/Target/NAME/`) that Bazel globs.
- **What a hello-world links** (declarations of its LLVM IR for the host):
  `write`, `dup`, `fdopen`, `fflush`, `fclose` and nine `KGEN_CompilerRT_*`
  functions. The whole standard library names 29 `KGEN_CompilerRT_*`
  functions and 57 libc functions through `external_call`.
- **`DeviceContext` is not open source.** At this tag it is
  `max/mojo/max/gpu/host/device_context.mojo` (package `max`, 7,155 lines),
  which calls 78 `AsyncRT_DeviceContext_*`/`AsyncRT_DeviceBuffer_*` C
  functions that no file of the repository defines: the CUDA, HIP and Metal
  backends ship only inside MAX's binaries (Modular MAX Community License).
  `AsyncRT/lib/Runtime` has a CPU device only. The standard library keeps
  the kernel side (`std._gpu`: `thread_idx`, `block_idx`, `block_dim`…) and
  `std.compile.compile_info`, which compiles one function for another target
  at compile time and embeds the text in the program. The NVPTX, AMDGPU and
  Metal *code generators* are not in the public tree either ("please install
  MAX for accelerator support"); only the host target is.
- **So a Dolly `DeviceContext` is a new implementation of the same shape**:
  a compiler target that prints a kernel as WGSL (`compile_info` then embeds
  WGSL), and a small Mojo package over `gpu@0`. Nothing of `max/` is used.
- **The WGSL shape works through `gpu@0` as it is** (Chrome 151 headless,
  SwiftShader, 2026-10-12): a hand-written kernel in exactly the form the
  target prints (storage buffers `array<u32>` per pointer parameter, a
  read-only buffer of 32-bit argument slots, `block_dim` as override
  constants of the pipeline through `COMPUTE_CONSTANTS`, control flow as a
  block number in `loop { switch }`), driven by
  `demos/mojo/target/runtime/gpu.c`, returned `2*a[i]+0.5` for 1,000 floats.
  Headless Firefox gets no adapter, as `docs/gpu.md` says.
