# LLVM 22.1.8 is compiled twice in the catalog: llvm22 for Zig and rust-llvm for Rust

- STATUS: OPEN
- PRIORITY: 60
- TAGS: audit,build,llvm,rust,0.1.8

From the build-time audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at
`b09b1e243`). Evidence and scripts: `work/audit-1116-evidence/buildtime/`.

## State (2026-11-16)

Measured; the measurement says to change nothing while builds can run four or more at a time
(`20261116-140603-buildtime-02`). Close on that once the count is chosen.

## Found

- `llvm22` builds upstream LLVM 22.1.8 with Clang and LLD and every target Zig requires
  (`demos/llvm/Dollyfile-llvm22-tablegen:35-46`, upstream's `cmake/Findllvm.cmake`): 4,552 s, plus
  llvm22-tablegen's 231 s. `rust-llvm` builds Rust's fork of the same release (`llvm-config
  --version` prints 22.1.8 in `build/image-logs/rust-llvm.log`), WebAssembly only: 1,589 s. Both are
  in the published catalog.
- rust-build on llvm22 in place of rust-llvm, replayed on 0.1.7's times (`REPLACE=` in
  `simulate-schedule.mjs`, `schedule-rust-on-llvm22.txt`): the catalog's build time falls from
  11.37 h to 10.93 h, the wall time at 2 builds at a time from 5.71 h to 5.48 h, at 3 from
  3.93 h to 3.78 h; but the longest chain becomes system-build … python, llvm22-tablegen, llvm22,
  rust-build, codex: 3.01 h instead of 2.13 h, so at 4 or more builds at a time the catalog is no faster
  (3.08 h against 3.05 h) and at 6 slower (3.02 h against 2.17 h).
- Not confirmed: that rustc 1.98.1 builds and passes `demos/rust`'s fixed-point check against
  upstream 22.1.8 rather than its fork.
- llvm22 is in the catalog for `zig-llvm`, which `ghostty-gtk` uses
  (`tasks/20261116-140822-ports-04`, whose chain the owner may drop from release rounds; then
  this task is moot).

## Done when

Closed on the count `buildtime-02` chooses: at 4 or more, with these numbers; at 2 or 3, after
rust-build is built and tested on llvm22.
