# Mojo programs that run in Dolly: target, runtime, standard library, and DeviceContext over gpu@0

- STATUS: OPEN
- PRIORITY: 335
- TAGS: toolchain,mojo,gpu,demo

Owner (2026-10-12): "Ideally in an image with WebGPU where mojos DeviceContext
works for GPU compute." The compiler itself is
[its own task](../20261012-130814-mojo-compiler/TASK.md).

## For the compiler's side (`demos/mojo/`, task mojo-compiler)

What a compiler built in Dolly must carry for its programs to run here; all
of it is in `demos/mojo/target/` and described in its README:

- Apply `patches/compiler.patch` and `patches/stdlib.patch` to the tag
  `mojo/v1.1.0`. The compiler patch needs LLVM's WebAssembly backend linked
  in (`BACKENDS` for Bazel; whatever builds LLVM in Dolly has it already). Its
  three new directories are found by upstream's globs.
- Default the driver to `--target-triple wasm64-unknown-dolly`: upstream
  takes the host's triple, CPU and features from LLVM, which knows no Dolly.
  With that triple the patch selects the CPU `generic` and the features of
  `cc`'s objects.
- `mojo build` links by running `cc ARCHIVE COMPILER-RT -Wl,--gc-sections -lm
  -o OUT` (`Mojo/tools/mojo/Build/mojo-build.cpp`, `linkOutput`). Give it
  `/usr/lib/libmojo-rt.a` of the `mojo-runtime` image as the CompilerRT path
  of `modular.cfg`; a program that imports `gpu` also needs `-lmojo-gpu
  -ldolly-gpu` and the package directory `demos/mojo/target/gpu` on its
  import path.
- `mojo run`, `mojo repl` and `mojo debug` go through LLVM's JIT
  (`Mojo/lib/ExecutionEngine`), which Wasm cannot have. Decision: `mojo run`
  becomes build, spawn, wait; the other two are refused by name.
- The recipe `demos/mojo/Dollyfile-mojo-runtime` and one line of
  `demos/mojo/README.md` are in that directory because recipes and their
  descriptions are found only there: merge the README with yours.

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

## Done 2026-10-12: programs and kernels run (commits 0571270c and after)

`node demos/mojo/target/test/mojo-target-browser.mjs` with `DISPLAY=:142`,
objects from `demos/mojo/target/cross-compile.sh`, image `mojo-runtime`:

| Browser | Adapter | Result |
| --- | --- | --- |
| Chrome 151.0.7922.71 headless | SwiftShader | passed |
| Chrome 151.0.7922.71 on Xvfb, Vulkan | NVIDIA (`nvidia blackwell`) | passed |
| Firefox 157.0.1 on Xvfb | unnamed WebGPU adapter | passed |

Each run links four cross-compiled objects with `cc` in the session and
checks their output: `hello` (print), `library` (split, `List`, `Dict`,
`Path.write_text`/`read_text`, `exists`, `argv`, float formatting, a clock),
`saxpy` (one kernel over 1,000 floats through
`DeviceContext.enqueue_function`) and `kernels` (a loop, signed and unsigned
integer arithmetic on a two-dimensional grid, `sqrt`/`abs` and conversions;
every element compared with the host's).

How it is built, what a kernel may contain and what is refused:
`demos/mojo/target/README.md`. Refusals measured: a `Float64` kernel fails
the build with `WGSL has no such type:  %11 = load double`; an `Int64`
argument with `a WebGPU kernel argument is a DeviceBuffer, Int, UInt, Int32,
UInt32, Float32 or Bool`.

### Decisions

- **Two targets, named for what they are.** `wasm64-unknown-dolly` for
  programs (LLVM sees `wasm64-unknown-emscripten`, as from `cc`: the triple
  of the libc archives, not the platform's name) and `wasm32-unknown-webgpu`
  for kernels. The standard library asks `CompilationTarget.is_dolly()`.
- **WGSL comes from the compiler, at compile time.** `std.compile.compile_info`
  already compiles one function for another target and embeds the text, and a
  backend may print that text itself (`TargetBackend::emitAssembly`). So the
  kernel is optimized as 32-bit LLVM IR and printed as WGSL by 700 lines in
  the compiler; the program carries WGSL as a constant and needs no LLVM, no
  SPIR-V and no translator when it runs. 32-bit because Mojo's `Int` is the
  target's pointer width and WGSL has no 64-bit integer.
- **Why not LLVM's SPIR-V backend.** It emits OpenCL-flavoured SPIR-V for
  `spirv64`, which WebGPU's translators do not take, or expects HLSL resource
  intrinsics for Vulkan; either way Dolly would also need Tint or Naga to
  reach WGSL. Not tried.
- **`block_dim` is the workgroup size**, an override constant of the pipeline
  (`COMPUTE_CONSTANTS`), so `thread_idx`, `block_idx`, `block_dim` and
  `grid_dim` are WGSL's own builtins and mean what they mean on CUDA.
- **The runtime is new C over libc, not upstream's CompilerRT**: see the next
  section.

### What is left, measured

- **Upstream's CompilerRT does not compile here as it is.** It is 1,100
  lines of its own, and `bazel query 'kind("source file",
  deps(//Mojo:CompilerRT))'` names 2,543 C and C++ files beneath it: 2,221
  of LLVM, 105 of Abseil, 58 of tcmalloc, 62 of `Support`, 19 of AsyncRT (its
  thread pool). Its entry points take `llvm::StringRef` by value. The
  standard library calls them now with a struct and now with a pointer and a
  length (`_get_global` and `_get_global_or_null` in `std/ffi`), which is
  the same on x86-64 and arm64 and not in the C ABI of Wasm, where a two-word
  struct goes by reference. The compiler lowers `external_call` without a C
  ABI for Wasm (`CABILowering.cpp` knows x86-64 and AArch64), so a struct is
  its fields. `libmojo-rt.a` implements the 29 `KGEN_CompilerRT_*` functions
  the standard library names with those flattened arguments, on one thread.
  Threads through `threads@0` and Python interoperation are not there.
- **Standard library: what was ported is what the fixtures and the probe
  cover.** Not ported, and failing at compile time or at link: `std.pwd`,
  `std.os.process` and `std.subprocess` (they assert Linux or macOS; Dolly
  has `posix_spawn`, no `fork`), `_get_environ`, `dlopen` (Dolly's is
  `dolly_dlopen`, selected by `cc` for C only), `std.python`.
- **C calls with the wrong integer width trap on Wasm.** `read`, `write`
  and `mkdir` passed an `Int` for an `int`; fixed in the patch. Every other
  `external_call` of the 57 libc functions the library names has to be
  checked the same way: `sys/_libc.mojo` declares `write` returning `c_int`,
  for one. `wasm-ld` warns of each mismatch when a program links.
- **Kernels**: buffers of 8- and 16-bit scalars, `Float64`, `Float16`, SIMD,
  shared memory and barriers, atomics, `print`, more than 256 threads in a
  block, and host-side `map_to_host`/`HostBuffer`/`TileTensor` (upstream's
  examples use `layout`, which is in `max/`).
- `mojo build --print-supported-targets` lists LLVM architectures and omits
  both targets, since it asks for a triple without an operating system.

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
