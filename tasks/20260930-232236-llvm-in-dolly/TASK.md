# Build LLVM, Clang and LLD inside Dolly

- STATUS: OPEN
- PRIORITY: 265
- TAGS: toolchain,bootstrap,llvm,core

The keystone for the bootstrap goals: a self-hosted rustc
(`20260930-231100-self-host-rust`), an LLVM-enabled Zig, and a compiler seed
reproducible from inside Dolly all need LLVM built by Dolly's own `cc`. Today
the seed compiler (Clang/LLD 24, one 75 MiB executable) is built on the host by
`scripts/build-toolchain.sh` (native tblgen at `:83`, flags at `:96-97`).
Source: Fable review, 2026-10-01.

## Measure first

- tblgen built by `cc` inside Dolly, then run on LLVM's `.td` files.
- The three heaviest Clang translation units: wall time and peak memory
  (the Zig spike saw 2-3.3 GB per large compile).
- The LLD link of the compiler executable (inputs are copied by `mmap`, so
  memory roughly doubles).
- The translation-unit count, to extrapolate the serial and `-j N` total.

## Risks

- 8 GiB per process and per kernel memory; the build tree and sources
  (3-4 GB) live in WasmFS inside that memory. Stage builds as images that keep
  only archives (the 2 GiB import limit forbids retaining trees).
- The ~0.5 MB Worker stack (it stopped the wasm2c route for zig1).
- Serial processes: the total only becomes practical with parallel build
  jobs (`20260930-231102-parallel-rust`).
- Two LLVMs today: 24 for the seed (`config/source-pins.sh`), 22 for rustc
  (`demos/rust/toolchain/bootstrap-sources.json`); settle one before building.

## Done when

- An image builds LLVM, Clang and LLD from pinned sources with only in-sandbox
  tools; a stage built by that compiler reproduces it byte for byte (stage 2
  equals stage 3); the result can replace the host-built seed.
