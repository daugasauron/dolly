# Build Rust programs with threads@0

- STATUS: OPEN
- PRIORITY: 260
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

## Progress (2026-10-01, merged into `next`)

- `dolly-rust-link` links every Rust executable with `cc -pthread` (threaded
  libc, `dolly_thread_start`, `threads@0`); std already carried atomics, so no
  build-std was needed. The SDK's std is now built without debug assertions
  (`thread::yield_now` panicked on `sched_yield`'s ENOTSUP). `libdolly-rust.a`
  is gone.
- Core fixes found on the way: the threaded libc lacked
  `emscripten_num_logical_cores` (now 4), and a main thread blocked in
  `pthread_join` never saw kernel-raised signals such as SIGCHLD (now EINTR,
  handler, restart).
- Removed patches: `tokio-memory-fs`, `fd-serial`, `ignore-serial-prune`,
  Codex `arg0.patch`; the Codex TUI's timer-polled input source is gone.
- Measured (Chrome, 5,664 files): rg 778 ms single-threaded vs 321 ms with
  4 threads; codex-build image 2,128-2,189 s vs ~4,000 s earlier (different
  load). Rust, threads and Codex browser tests pass.
- Open: threaded Codex reaches sign-in in ~2.8-3.6 s in ~70% of runs (was
  ~1 s), cause not found; the processor count is fixed at 4; `sched_yield`
  returns ENOTSUP; signals reach a main thread parked on a futex only at its
  next system call; the Pi image was not rebuilt.

## Decisions (2026-10-01, delegated)

- Keep the reported processor count fixed at 4: deterministic builds and no new
  browser-derived value crossing into the guest.
- `sched_yield` returns 0 in the threaded libc: POSIX lets it return at once when
  nothing else can run, and Workers cannot cede a core.
