# Run build tools' jobs in parallel

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

## Broader scope (Fable review, 2026-10-01)

Patti's `-j` is the first step. The same need applies to every build tool:
Make (done below), Ninja and Cargo, and LLVM inside Dolly
(`20260930-232236-llvm-in-dolly`) is only practical in parallel. Give
concurrent spawns a supervisor memory budget (the cap is 32 processes,
`src/process-supervisor.mjs:23`).

## GNU Make -jN (2026-10-01, `work/make-jobs`)

- Make uses its upstream `posix_spawn`, `$(shell)` pipe and pipe-jobserver
  paths; `make-dolly.c` and the one-slot patch are gone. The libc adapter's
  `posix_spawn` replays `adddup2` as spawn mappings and returns ENOTSUP for
  other actions and attributes. The kernel already waited for any child,
  posted SIGCHLD and shared pipes across processes.
- Two gaps surfaced under load: concurrent `cc` runs shared the staged name
  `/tmp/dolly-cc-0-*` (now per pid), and Make's dup-and-close SIGCHLD wakeup
  lost its descriptor because Dolly runs handlers at the next syscall entry.
  An atomic `pselect` in `signal.c` lets Make use its pselect jobserver.
  `docs/architecture.md` now records Slop as serial and builds as parallel.
- Measured: Git's 426 `-O0` translation units (`git.dm` flags, compile and
  `ar` only) in the default image, host load 5-10 on 16 threads; `libgit.a`
  is byte-identical at every `-j`.

  | | `-j1` | `-j4` | `-j8` |
  | --- | --- | --- | --- |
  | Chrome wall | 72-77 s | 43 s | 39-40 s |
  | Chrome peak PSS, whole browser | 1138-1214 MiB | 1155-1183 MiB | 1278-1342 MiB |
  | Firefox wall | 96 s | 44 s | 39 s |
  | Firefox peak PSS | 1672 MiB | 1860 MiB | 2138 MiB |

  CPU-bound jobs scale (eight 0.6 s jobs: 4.8 s, 1.3 s at `-j4`), but each
  `cc` spends ~80 ms in a serial launch of the 78 MB compiler: 40 runs of
  `cc --version` take 4.2 s at `-j1` and 3.3 s at `-j8`. Fitting the Git
  times, ~34 s of 77 s is serial, which caps small-TU builds near 2x. Likely
  the kernel's image read plus the supervisor's copy and SHA-256 per spawn;
  not yet profiled.
- Limits: each `cc` is two processes, so the 32-process cap allows about
  `-j13`; unbounded `-j` fails spawns with EAGAIN. `-O` warns that it has no
  lock (`F_SETLKW` is ENOTSUP) and still groups output per target.
- Remaining: Ninja's Samurai still runs a serial `dolly_spawn` loop
  (`config/samurai-dolly.patch`); its upstream `jobstart` needs `posix_spawn`
  `addclose` of an inherited pipe end, which spawn mappings cannot express,
  and `addopen`. CMake's Makefile generator should now honor
  `cmake --build --parallel N` through the shared jobserver; the cmake demo
  still uses `--parallel 1` and was not rerun.
