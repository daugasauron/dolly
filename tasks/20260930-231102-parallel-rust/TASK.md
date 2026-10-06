# Run build tools' jobs in parallel

- STATUS: OPEN
- PRIORITY: 230
- TAGS: rust,build,iteration

## Remaining (2026-10-07)

Done and in the candidate: Patti `-j N` (ripgrep, fd, protox byte-identical
at `-j 1` and `-j 4`, times below), GNU Make `-jN` over its upstream
jobserver, Slop's concurrent program stages, `xargs -P`. Left:

- `codex-build` at `-j 4`: the full wall time and a byte comparison with a
  serial build on the same seed (the run was cut off at 30 minutes).
- Ninja (Samurai) still spawns serially (`config/samurai-dolly.patch`); its
  `jobstart` needs `posix_spawn` `addclose`/`addopen`.
- The decision of 2026-10-01: a supervisor memory budget in place of the
  fixed 32-process cap, which bounds CMake builds at `-j4`.

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

`codex-build` at `-j 4` (1,117 nodes) was cut off at 30 minutes by the agent's
command limit, not by a failure: 1,112 nodes had started by 1,576 s, against
3,980 s for the whole serial build; the rest lead to the `codex` binary. The
tab's RSS rose from 4.2 GiB to a 18.9 GiB peak (one sample of a serial
codex-build tab: 8.3 GiB), so `-j` costs memory on large crates. Still open:
the full `codex-build` time and a byte comparison with a serial build on the
same seed.

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

## Decision (2026-10-01, delegated)

Replace the fixed 32-process cap with a supervisor memory budget (admit a spawn
while committed Wasm memory stays under a page budget), keeping a hard count
limit as a backstop. Until then LLVM-sized builds run at `-j4`.
