# Kernel C duplication and oversized dispatch

- STATUS: CLOSED
- PRIORITY: 130
- TAGS: core,cleanup

`src/dolly.c`: event-ring drain twice (`100-142`, `690-716`), `update_suspended_terminal_layout`
forward-declared twice (`88`, `401`), the `DOLLY_EM_JS` trick copied into `dolly.c:152`,
`gpu-kernel.c:29`, `audio-kernel.c:30` without explanation.
`checked_add`/`read_exact`/`put_u32`/`put_u64` duplicated between `system-snapshot.c:202-263`
and `session-snapshot.c:48-92`, plus five read-whole-file loops. `process_dispatch` is a
720-line switch. Supervisor oddities: `deadline_remaining() === -2` as an exited check
(`process-supervisor.mjs:436`), `worker_failed` used for normal completion (`:620`), `result >=
0n` twice (`:571`), misplaced comments (`:507`, `process-kernel.c:1300`), duplicated C/C++
`static_assert` blocks in `process.h:669-800`.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Shared helpers live once (e.g. `fs-record.h`); dispatch cases are small functions.

## Done when

- Duplicates removed; kernel and browser tests unchanged in behavior.

## Progress (2026-10-01)

- `process_dispatch` routes every host module operation through the generated
  `dolly_kernel_module` table; module packets and state live in `host/*/kernel.c`.
- GPU and audio share `src/device-lease.c` instead of two copies.
- The unreachable terminal wait path and its session servicing are gone from
  `src/dolly.c` (1,432 -> 988 lines since the checkpoint).
- Remaining: the core file-system and descriptor cases of `process_dispatch`
  (kernel audit K2, K6).

## Progress (2026-10-01, branch `work/core-polish`)

Every item named by the audit is gone: the event-ring drain and the duplicated
forward declaration left with the display kernel move, `DOLLY_EM_JS` is
explained once in `process-kernel.h`, the snapshot helpers share
`fs-record.h`, the supervisor's exited check and `result >= 0n` repeats are
gone. This branch also made the HTTP and download kernels' helpers static,
removed the unread session marker and the `main` the kernel never ran.
Remaining, recorded in `20261001-000000-host-modules`: `process_dispatch` is
still one switch over the core descriptor and path cases (small functions
inline), the staging buffer appears in `system-snapshot.c` and
`host/snapshot/kernel.c`, and `collect_tree` re-implements `dolly_fs_metadata`.

## Closed (2026-10-05, big-picture review)

Every duplicate this audit named is gone (`work/core-polish`, recorded
above). What remains is not duplication: `process_dispatch`
(`src/process-kernel.c:1333-1990`, 50 cases) is the system call table, and
splitting it is file reorganization, which `tasks/README.md` ranks last.
