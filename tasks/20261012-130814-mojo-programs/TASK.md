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
- To prove the pair in the `mojo` image: `mojo build` each of
  `demos/mojo/target/test/fixtures/*.mojo` there and expect the lines that
  `demos/mojo/target/test/mojo-target-browser.mjs` greps for (it links the
  same programs from cross-compiled objects). `tasks.mojo` needs the
  target's tail calls and the four GPU programs the package `gpu`; with
  `--disable-gpu --enable-unsafe-webgpu` headless Chrome runs them on
  SwiftShader.

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

Each run links six cross-compiled objects with `cc` in the session and
checks their output: `hello` (print), `library` (split, `List`, `Dict`,
`Path.write_text`/`read_text`, `exists`, `argv`, float formatting, a clock),
`tasks` (coroutines awaited through the runtime's task queue), `saxpy` (one kernel over 1,000 floats through
`DeviceContext.enqueue_function`), `kernels` (a loop, signed and unsigned
integer arithmetic on a two-dimensional grid, `sqrt`/`abs` and conversions;
every element compared with the host's) and `mandelbrot` (the set drawn as
text from a kernel's escape times, and a 24 by 24 matrix product).
Screenshots of the three browsers after these runs are in
`build/mojo-target-evidence/` of the worktree.

How it is built, what a kernel may contain and what is refused:
`demos/mojo/target/README.md`. Refusals measured: a `Float64` kernel fails
the build with `WGSL has no such type:  %11 = load double`; an `Int64`
argument with `a WebGPU kernel argument is a DeviceBuffer, Int, UInt, Int32,
UInt32, Float32 or Bool`.

### The standard library's own tests, in Dolly (2026-10-13, headless Chrome 151)

`Mojo/stdlib/test` has 261 `test_*.mojo` files that are programs (35 more
are compile-failure tests with `RUN:` lines). Each was cross-compiled with
`-D ASSERT=all` and no per-test option of its `BUILD.bazel`, linked with
`cc NAME.o -lmojo-rt` in one `mojo-runtime` session with the test tree
unpacked at its source path, and run (3.5 minutes for all):

| Files | Outcome |
| --- | --- |
| 178 | exit 0: every test of the file passes |
| 33 | the output its `CHECK` lines expect (most abort on purpose, status 126) |
| 13 | not judged: 10 lacked their file's build options (`LOGGING_LEVEL`, `MOJO_STDLIB_SIMD_UNINIT_CHECK`, `ASSERT=warn`); `os/test_process` and `runtime/test_locks` print what is expected, which my check (stricter than FileCheck about spaces and order) did not accept; `benchmark/test_quick_bench` not looked at |
| 11 | fail: 7 need another platform, build or arguments (`sys/test_linux_target`, `test_aarch64_target`, `test_targetinfo`, `test_c_types`, `test_build_info_debug`, `test_compile_debug`, `testing/test_suite_cli`), `os/test_env` wants Bazel's environment, and three meet Dolly: no FIFO (`builtin/test_file`, 32 of 33), no hard link (`os/test_link`), no password database (`pwd/test_pwd`) |
| 12 | do not link: 9 of `python/`, `os/test_stat` and `testing/test_assertion` need `KGEN_CompilerRT_Python_SetPythonPath`; `test_utils` has no `main` |
| 14 | do not compile: 5 import `max`, 1 a GPU target, 1 `reflection`; `sys/test_ffi`, `test_dlhandle`, `test_macos_target` are for other platforms; 2 need bfloat16, which LLVM's WebAssembly backend cannot select; `runtime/test_asyncrt` and `test_raising_asyncrt` fail in this compiler for x86-64 too, and in the released one |

Among the 178: `os/test_process` and the three tests that spawn themselves to
watch an abort (`Process.run`, `waitpid`, `kill`, the environment),
`subprocess/test_run` (`popen`), `tempfile`, `pathlib`, `os/test_listdir`,
`test_symlink`, `time`.

Before that came to pass:

- Every program with both an indirect call and a function pointer failed to
  link (`duplicate symbol name __indirect_function_table`, 205 of 243
  files): the compiler prints an object in another MC context than the one
  its code was generated in. Fixed in `MCLinker.cpp`.
- `lseek` was called as `(i64, i64, i64)` and trapped, `waitpid` with a
  64-bit `pid_t`. With them fixed, the objects of all 247 files call 80 libc
  functions, each with the type libc defines (import and definition types
  read from the Wasm objects).
- A Mojo abort is a trap, which Dolly reports as exit status 126 and Linux
  as a signal: `std.testing.assert_aborts` now knows both.

Measured on the GPU (Xvfb, 2026-10-13): 5,000 `enqueue_function` calls of
a kernel over 2^20 floats, then `synchronize()` and a read of all 4 MiB,
give 5000.0 everywhere: Chrome 151 on the NVIDIA GPU in 1.51 s (0.3 ms an
enqueue) and 10 ms for the read, Firefox 157 in 1.24 s and 104 ms, headless
Chrome on SwiftShader in 26.7 s.

The scripts of this measurement are scratch, in `build/mojo-target/` of the
worktree (`stdtests/`, `session.mjs`, `stdtests.cmds`), not committed: the
natural form, once the compiler runs in Dolly, compiles the suite there.

Two of upstream's example programs run unchanged:
`Mojo/examples/operators/main.mojo`, and `Mojo/examples/life/benchmark.mojo`,
where 1,000 evolutions take 15.4 s and 3.09 s against 10.6 s and 2.19 s for
the released compiler on this machine's x86-64: 1.4 times.

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
  Nothing public in the standard library of this tag starts parallel work
  (`parallelize` is in `max`), so `threads@0` is not used; Python
  interoperation is not there.
- **Standard library: not ported**: `dlopen` (Dolly's is `dolly_dlopen`,
  selected by `cc` for C only, and needs `dso@0`), `std.python`, bfloat16.
  `std.pwd` compiles and finds nobody: Dolly has one user and no database.
- **C calls with the wrong integer width trap on Wasm.** `read`, `write`,
  `lseek`, `mkdir` and `waitpid` passed an `Int` for an `int`; fixed in the
  patch. What
  the test suite does not call is unchecked: `sys/_libc.mojo` declares
  `write` returning `c_int`, for one. `wasm-ld` warns of each mismatch when a
  program links.
- **Kernels**: stores of 8 and 16 bits (loads work), `Float64`, `Float16`,
  SIMD, shared memory and barriers, atomics, `print`, more than 256 threads
  in a block, the libm functions WGSL lacks (`log10`, `cbrt`, `expm1`, `erfc`,
  gamma and Bessel functions), and host-side
  `map_to_host`/`HostBuffer`/`TileTensor` (upstream's examples use `layout`,
  which is in `max/`).
- **What `gpu@0` lacks for this, written down and not added**: a kernel has
  no way to say anything (no print, no trap), so a failed `assert` ends the
  invocation silently; the text of a rejected shader or pipeline reaches the
  page's indicator and not the program, which gets an errno (a block over
  the device's limit is `EIO`, an aliased buffer `EINVAL`); buffers come
  back only through a mapped staging buffer, 64 KiB a call (4 MiB in 10 ms
  in Chrome); a dispatch is at most 65,535 workgroups a dimension and 2^20
  in all. `CAPABILITIES` reports the device's workgroup limits;
  `DeviceContext` does not read them yet to refuse a block by name.
- **One run not attributed**: at 00:14 the scratch GPU runner, with Chrome
  on the NVIDIA GPU, the `kernels` object and a six-job compile beside it,
  had not returned after ten minutes and was killed. The same object passed
  three times in Chrome and twice in Firefox afterwards. The runner had no
  time limit and kept no output, so it is unknown which step stood still.
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
