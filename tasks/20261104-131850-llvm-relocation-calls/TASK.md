# LLVM's wasm object writer makes three kernel calls per relocation

- STATUS: OPEN
- PRIORITY: 180
- TAGS: performance,llvm,kernel,iteration

## State (2026-11-18, the compiler batch)

cc's part is done on `fix/compiler-batch`, for 0.1.8's compiler round; Zig's is left.

- **cc**, without a patch to LLVM (which would change `llvm-build`, and so the compiler round's
  fixed point): the driver gives Clang an output backend of its own (`MemoryOutputBackend` in
  `programs/compiler.cpp`), whose files are streams into memory, as Clang uses for a stream that
  cannot seek, each written to the file once when Clang keeps it. The object's bytes are the
  same: `llvm-cc`'s recipe compiles its sample with the seed compiler and this one and compares.
- Measured, `cc -O2 -c big.c` in `system` (an `awk`-generated file of 4,000 functions, each
  calling the one before and reading a static array: `build/agent/count-probe.mjs` of
  `work/compiler`, with a count by operation in the supervisor's handler, not committed). The
  compiler process, before: 79,950 `FD_SEEK` and 40,357 `FD_WRITE` in Chromium and in Firefox,
  11.3 to 16.9 s in Chromium and 15.1 to 20.1 s in Firefox (the machine at a load of 16 to 29);
  after, with the compiler `llvm-cc` linked from this driver (in its image in Chromium, in
  `system` on the seed it makes in Firefox): 2 `FD_SEEK` and 95 `FD_WRITE` (the object's
  1,536,937 bytes, the same size as before, in the packets a write is split into), 9.0 to
  11.4 s in Chromium and 10.1 to 15.5 s in Firefox.
- **Zig** is left: its LLVM backend writes through Zig's own `raw_fd_ostream`
  (`ZigLLVMTargetMachineEmitToFile` in `src/zig_llvm.cpp`), so its part is a patch to Zig's
  source (or to LLVM 22's `raw_fd_ostream`), and a `zig-llvm-build` to prove it, a heavy chain
  this batch does not build.

## State (2026-11-16, the audit)

Not started. No patch in `demos/llvm/`, `demos/zig/` or `config/` touches `pwrite_impl` or
`applyRelocations`. The build-time audit counts this among a compile's costs
(`tasks/20261116-140603-buildtime-00`).

Found measuring `zig build` (`tasks/20261103-102041-zig017`, section "zig build's first run";
evidence under `build/zigperf-evidence/` of `work/zigperf`, 2026-11-04).

LLVM writes a WebAssembly object's sections, then patches every relocation into the file:
`WasmObjectWriter::applyRelocations` calls `raw_pwrite_stream::pwrite` once per relocation, and
`raw_fd_ostream::pwrite_impl` is `lseek`, `write`, `lseek` (`llvm/lib/Support/raw_ostream.cpp`).
Natively that is cheap; in Dolly each is a kernel call. Zig's LLVM backend writes its objects this
way (`ZigLLVMTargetMachineEmitToFile` hands LLVM a `raw_fd_ostream`), and natively so does Clang
behind `zig cc`.

- Calls per object, counted natively with `strace -c` (host Zig 0.17, LLVM 22): `zig build-obj
  hello.zig -target wasm64-emscripten` (the zig demo test's program, Debug): 63,294 `lseek` and
  31,970 `write`; Zig 0.17's maker for wasm64, ReleaseSafe: 190,946 and 96,801; SQLite's
  `sqlite3.c` (`zig cc -target wasm32-wasi -c`): 698,881 and 353,099 at `-O0`, 258,589 and
  130,259 at `-O2`.
- Cost per call in a `default` session (`bench.c`, 100,000 calls, `-O2`): `lseek` 10.7 µs and the
  writer's three calls 34 µs in Chromium 156; 21 µs and 63 µs in Firefox 155 (native: 0.06 µs and
  0.6 µs).
- Dolly's own `cc` does it too, so every image build pays it. Counted per process in a session
  (Chromium, 2026-11-05, a count by operation in `src/process-supervisor.mjs`'s message handler,
  printed at exit and not committed): `cc -O2 -c big.c` of a generated file of 4,000 small
  functions (`native/gen.sh`), 4.5 s, made 104,008 `FD_SEEK` and 52,371 `FD_WRITE` calls, about
  1.7 s of them at 10.7 µs; `zig cc -O2 -c big.c` (8.5 s, an object of 3.75 MB against `cc`'s
  1.48 MB) 284,044 and 142,774; `zig build-exe hello.zig`'s compiler 139,232 and 70,371. A Chrome
  trace of `zig cc` (Clang with names) puts 2.7 s of its 7.3 s under
  `raw_fd_ostream::pwrite_impl`. (The same count showed `amy install zig-llvm`'s installer making
  243,235 `PATH_STAT` and 59,120 `PATH_OPEN` calls for 19,660 files.)
- In Zig 0.16's first `zig build` (Chromium trace), the zig process spent 8.1 s of its 28 s
  compile of the build runner and compiler_rt in them (LLVM's codegen 14.1 s, Sema 2.2 s).

`tasks/20261101-074306-audit-kernel` measured the call (8-25 µs in Chromium, 11-35 µs in Firefox;
the `postMessage` and `Atomics.wait` hop 9.8 µs, 6.2 µs with `Atomics.waitAsync`) and left the
call path as it is because "no measured workload has shown" a gain: this is one.

Options, each to measure on `cc -O2 -c big.c` and the zig demo's `zig build`:
- LLVM writes the object into memory and the file once: `buffer_ostream`, which LLVM already uses
  for a stream that cannot seek, or `pwrite_impl` patching a buffer. A patch to LLVM (the seed's
  `llvm-cc` and `llvm22`), so a compiler round; or to Zig's `src/zig_llvm.cpp`
  (`ZigLLVMTargetMachineEmitToFile`'s `raw_fd_ostream`), for Zig alone.
- `pwrite_impl` as one `pwrite`: a third of the calls, the same patch's size.
- A cheaper call for every program (the audit's `waitAsync` hop): about 40% off each call.

Done when: `cc` and Zig make at most a few hundred kernel calls to write an object (`big.c`, the
demo's `zig build`), measured before and after in Chromium and Firefox.
