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

## Findings (2026-10-01)

- `patti build -j N` plans the serial depth-first order, then starts every node
  whose dependencies are built while fewer than N commands run, waiting with
  `waitpid(-1)` (Dolly's libc maps it to `dolly_waitpid`). A node's steps (build
  script compile, its run, library, root binary) stay sequential. `-j 1` is the
  old serial order; the record lists commands in that order for any N.
- Each command's stdout/stderr goes to `target/build/<crate>/log` and prints as
  one block when it exits. A failing command prints its log and fails; `fail()`
  waits for running children, whose artifacts stay unstamped, so `--resume`
  recompiles them.
- The compiler staged outputs at fixed `/tmp/dolly-cc-0-*` names, so concurrent
  links or `cc -c` clobbered each other. Fixed by the pid in the staged name
  (same hunk as `work/make-jobs` 9d35db8).
- Each linking rustc uses five Dolly processes (slop wrapper, rustc-real,
  dolly-rust-link, cc, compiler); the kernel table holds 32, so `-j 4` keeps
  the worst case near 22.

Image builds in headless Chrome on a shared 16-core host (load 6-11 from other
builds), patti step wall time, fixed seed; renderer RSS is the tab's peak:

| image | -j 1 | -j 4 | -j 8 | peak RSS -j 1 / -j 4 |
| --- | --- | --- | --- | --- |
| ripgrep (34 packages) | 118.4 s | 76.7 s | | 2.75 / 3.28 GiB |
| fd-build | 141.4 s | 65.4 s | 61.8 s | 2.69 / 3.68 GiB (-j 8: 3.83) |
| protox-build | 178.5 s | 74.5 s | | 2.79 / 3.62 GiB |

`/usr/bin/rg`, `/usr/bin/fd`, `/usr/bin/protox` and their
`/usr/share/dolly/builds/*.json` records are byte-identical between `-j 1` and
`-j 4` (and `-j 8` for fd). On the previous seed, the new Patti at `-j 1`
produced the same `rg` bytes as the old serial Patti. Recipes use `-j 4`.
Not measured: `codex-build`.

## Done when

- `codex-build`, ripgrep and fd build with `-j 4` or more, produce the same
  outputs as a serial build, and the wall times are recorded against the
  serial times.
