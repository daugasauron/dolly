# Build Rust programs with threads@0

- STATUS: OPEN
- PRIORITY: 200
- TAGS: rust,threads,codex,toolchain

Owner suggestion (2026-10-01): the Rust port predates `threads@0`; Rust
programs, Codex above all, may be better built with threads.

Today the Rust seed (built 2026-09-30) targets a single-threaded process:
`pthread_create` is a libc stub, and the Codex port carries no-thread patches:
tokio runs file work inline (`demos/rust/config/patches/tokio-memory-fs.patch`)
and the Codex TUI polls crossterm on a timer instead of using its
`EventStream` thread (`demos/codex/config/tui-events.patch`).

## Work

- Build the Rust standard library for the Dolly target with atomics and shared
  memory, and link Rust executables with `-pthread` against `threads@0`.
- Drop the no-thread patches that threads make unnecessary, starting with the
  two above.
- Measure Codex startup and a Patti build with threads against today's.

## Done when

- Codex, ripgrep, fd and protox build as threaded executables; the Codex demo
  test passes; the removed patches are gone from the source preparation.
