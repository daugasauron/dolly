# Investigate: subprocesses and the runtime as declared host modules

- STATUS: OPEN
- PRIORITY: 315
- TAGS: core,architecture,host-modules,process,design

Owner question (2026-10-02): "I thought subprocesses would be a host module?
And the dolly-runtime? Not sure if it makes sense or not to have the runtime
as a requirement but seems modular and nice."

## Today

`runtime@0` is already a module (`host/runtime/module.json`), but implicit:
`createHost` always attaches it and no recipe declares it. It owns the whole
core: 26 outer imports (memory, clocks, entropy, environment, the WasmFS
backing store, output), the supervisor and image contracts, the process ABI
(`dolly-process-0`, gate, DSO) and its headers, and the kernel sources
(`src/dolly.c`, `src/process-kernel.c`, `src/system-snapshot.c`,
`src/device-lease.c`, `src/file-blocks.cpp`). Subprocesses (spawn, wait,
pipes, signals) live inside it; each process is a browser Worker with its own
memory. `threads@0` is already separate.

## Questions

1. Should every image declare `REQUIRES HOST runtime@0`? Dollyfile 6 makes
   host requirements explicit and never inherited; an always-present implicit
   module is the one exception. Weigh consistency against a line every recipe
   would carry with no image ever omitting it (the role could imply it).
2. Should process lifecycle be its own module (`process@0` or similar)? Spawn
   grants no browser authority beyond Workers and memory, but those are page
   resources with quotas. What would a single-program image gain, and what
   breaks (Slop, `system()`, `posix_spawn`, pipes) when it is absent?
3. Is there a smaller honest split of the runtime (filesystem, clocks and
   entropy, terminal) that makes contracts clearer without adding ceremony?
   Every module costs a manifest, a contract and review rows.

Measure before deciding: count what each candidate split moves (imports,
exports, headers, kernel lines) and which images would declare what.

## Done when

- A short recommendation with the measured trade-offs is recorded here, and
  the owner decides; implementation, if any, becomes its own task.

Related: `20261001-000000-host-modules`, `20261002-072000-input-host-module`.

## Measurements and recommendation (2026-10-02, `core/host-modules-2`)

The runtime today: 26 outer imports (memory, growth and abort 3; clocks 3;
entropy 1; environment 2; seed preload 8; WasmFS backing store 6; output 3),
21 supervisor exports (17 process, 3 terminal, 1 mailbox), 13 image-boot
exports, the process contracts (`dolly-process-0`, gate, DSO), `process.h`
(652 lines) and `runtime.h` (120), and 3,371 kernel lines (`process-kernel.c`
2,142, `system-snapshot.c` 577, `dolly.c` 411, `file-blocks.cpp` 157,
`device-lease.c` 84). The process kernel splits by concern into about 900
lines of lifecycle (spawn 305 with shebang and descriptor mapping, wait,
signals, alarms, exit, the process table, 17 supervisor exports), 1,100 of
files, descriptors, pipes, directories and paths, 50 of clocks and entropy and
70 of terminal (plus 120 in `dolly.c`). Trusted JavaScript: supervisor 740,
process Worker 536, FFI 684.

1. `runtime@0` explicit: 0 of 51 images declare it and all 51 would, since
   every image runs on this kernel; packages' executables are stamped with
   the process ABI, not with a runtime record. Recommendation: keep it
   implicit, the one documented exception in `host/README.md`; a line that
   no recipe can omit says nothing the role does not already say.
2. `process@0` (spawn, wait, kill, pipes): would move SPAWN/WAIT/INFO/SIGNAL
   (4 of 55 operations), the spawn packet and flags (about 80 header lines),
   `dolly_spawn*`, `dolly_wait*` and `dolly_kill` (60 lines of `runtime.h`),
   about 500 kernel lines and 150 supervisor lines. Every ENTRY is
   `/bin/foreground -i /bin/slop …` and every builder runs `dollyfile`, which
   spawn, so all 37 runnable images declare it; `runtime-adapter.c` records
   the client in every libc-linked executable, so every package host
   declares it too. The process table, EXIT, self-signals and the ENTRY
   process stay in the runtime either way, and spawn grants no browser
   authority beyond the Workers and memory the ENTRY process already has
   (the 32-process quota stays in the supervisor). Recommendation: no.
3. Smaller splits (clocks and entropy: 4 imports, 50 lines; environment: 2,
   60; backing store and seed: 14 imports, 300 lines; output: 3, 30;
   terminal: no import, 190 lines): each costs a manifest, a contract, a
   digest and a boundary row, and every image needs all of them except the
   terminal, which headless images already lack by omitting `display@0`.
   `abi/dolly-browser-0.wat` already groups the imports by concern for
   review. Recommendation: none now; the split with a real omission case is
   keyboard and mouse (`20261002-072000-input-host-module`).
