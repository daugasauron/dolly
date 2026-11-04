# LLVM's wasm object writer makes three kernel calls per relocation

- STATUS: OPEN
- PRIORITY: 120
- TAGS: performance,llvm,kernel,iteration

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
- Clang does it in a session too: for a generated file of 4,000 small functions
  (`native/gen.sh`; natively `zig cc -O2 -target wasm32-wasi` makes 490,721 `lseek` and 246,322
  `write` calls), `zig cc -O2 -c` in a `default` session with `zig-llvm` took 7.8 s, and its
  Clang spent 2.7 s of 7.3 s under `raw_fd_ostream::pwrite_impl` (Chromium trace). Dolly's own
  `cc -O2` compiles the same file in 4.1-8.4 s in Chromium (8.6-8.9 s in Firefox) to an object
  of 1.48 MB, against `zig cc`'s 3.75 MB, so with fewer relocations; the seed compiler has no
  function names, so its calls are not attributed. Count them before counting `cc` in.
- In Zig 0.16's first `zig build` (Chromium trace), the zig process spent 8.1 s of its 28 s
  compile of the build runner and compiler_rt in them (LLVM's codegen 14.1 s, Sema 2.2 s).

`tasks/20261101-074306-audit-kernel` measured the call (8-25 µs in Chromium, 11-35 µs in Firefox;
the `postMessage` and `Atomics.wait` hop 9.8 µs, 6.2 µs with `Atomics.waitAsync`) and left the
call path as it is because "no measured workload has shown" a gain: this is one.

Options, each to measure on the zig demo's `zig build` (and `cc`, if it is affected):
- LLVM writes the object into memory and the file once: `buffer_ostream`, which LLVM already uses
  for a stream that cannot seek, or `pwrite_impl` patching a buffer. A patch to LLVM (the seed's
  `llvm-cc` and `llvm22`), so a compiler round; or to Zig's `src/zig_llvm.cpp`
  (`ZigLLVMTargetMachineEmitToFile`'s `raw_fd_ostream`), for Zig alone.
- `pwrite_impl` as one `pwrite`: a third of the calls, the same patch's size.
- A cheaper call for every program (the audit's `waitAsync` hop): about 40% off each call.

Done when: the demo's `zig build` (and `cc`, if it is affected) makes at most a few hundred kernel
calls to write an object, measured before and after in Chromium and Firefox.
