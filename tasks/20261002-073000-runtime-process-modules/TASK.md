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
