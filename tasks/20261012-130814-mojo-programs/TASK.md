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
