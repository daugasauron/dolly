# Compile independent Rust crates concurrently

- STATUS: OPEN
- PRIORITY: 230
- TAGS: rust,build,iteration

Owner decision (2026-10-01): use multi-core builds for Rust.

`codex-build` takes 3,980 s because Patti compiles its crates one at a time,
and each `rustc` process keeps a single core busy. Dolly processes run in
separate Workers, so several `rustc` processes can run on different cores at
the same time; only the kernel's system call dispatch stays serial.

## Work

- Patti starts every crate whose dependencies are built, up to `-j N`
  concurrent `rustc` processes, and waits for any of them to finish.
  Build scripts and procedural macros follow the same dependency order.
- Output stays per crate and in a deterministic record; a failing crate stops
  new starts and reports its own log.
- Measure N against memory: record peak memory per concurrent `rustc`.
- Later: once `20260930-230009-rust-threads` lands, rustc's own codegen
  parallelism (`-C codegen-units`, parallel front end) adds threads inside
  each process; Cargo (`20260930-231102-cargo-native`) replaces this scheduler.

This relaxes the "prefer simple serial semantics" guidance in AGENTS.md for
builds, at the owner's request.

## Done when

- `codex-build`, ripgrep and fd build with `-j 4` or more, produce the same
  outputs as a serial build, and the wall times are recorded against the
  serial times.
