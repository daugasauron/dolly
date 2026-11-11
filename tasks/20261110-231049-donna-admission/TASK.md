# Is the admission budget (56 processes, 4 GiB) contract or the browser host's own?

- STATUS: CLOSED
- PRIORITY: 100
- TAGS: donna,processes,design,0.1.6

Requested from Donna, the native Rust host of Dolly's userspace on wasmtime (`~/dev/donna`,
task `20261110-230235-dolly-requests` there; plan in `20261110-225114-native-host`). Donna runs
this repository's kernel, plugin, gate, programs and images unchanged and never forks a contract,
so what it needs changed is asked for here.

## State (2026-11-11)

Decided: the kernel's tables are the contract, since every host runs the same kernel:
56 processes (`DOLLY_KERNEL_PROCESS_LIMIT` in `src/process-kernel.c`, which
`getrlimit(RLIMIT_NPROC)` reports), 1024 descriptors a process, 64 pipes; so is what
executables are linked with (`RLIMIT_AS` 8 GiB, an 8 MiB stack). The rest is the browser
host's own, chosen for a tab: the 4 GiB budget, the 5 s wait at the count, the module cache
and threads@0's 32 a process and 64 in all; programs meet them only as waits and `EAGAIN`.
`docs/process-model.md` ("Executables") says so. No limit moved, so no code changed: the
supervisor's own count of Workers equals the kernel's table, as its trusted bound.

## Question

The supervisor admits a spawn while fewer than 56 processes exist and either their committed
Wasm memory is under 4 GiB or the spawner has no live child; over the count it waits 5 s, then
`EAGAIN` (`src/process-supervisor.mjs` `processWorkerLimit`, `processMemoryBudgetBytes`;
`docs/process-model.md` "Executables"). Threads are 32 a process and 64 in all
(`host/threads/threads.mjs`). Programs see some of it: `getrlimit(RLIMIT_NPROC)` is 56
(`src/process/libc-adapter.c`), and make and Cargo meet the waits and `EAGAIN`.

These numbers were chosen for a browser tab: Worker count, memory pressure, Worker termination
without a completion event. A native host has none of those reasons. Which of them are the
contract (every host must give the same, so programs behave the same) and which are the
browser host's own (a host may give more, and `getrlimit` reports what it gives)?

## Done when

`docs/process-model.md` says which limits are contract and which are the host's, and
`RLIMIT_NPROC` reports the host's value if it is the host's. Donna's supervisor task records
the answer.

## Closed (2026-11-11)

Decided in `a53be9e97` (`docs/process-model.md`, "Executables"): the kernel's tables are the
contract and the 4 GiB budget, the 5 s wait and threads@0's counts are the browser host's own.
`RLIMIT_NPROC` reports the kernel's table, which is the contract. Donna's
`20261110-230235-dolly-requests` records the answer.
