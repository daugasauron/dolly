# Kernel lifecycle details: SIGCHLD round trips, launching_pid, ignored results, held changes

- STATUS: OPEN
- PRIORITY: 200
- TAGS: kernel,lifecycle,signals,audit

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, K3, K4).

## State (2026-11-12)

Filed.

## Do

- SIGCHLD is set pending at default disposition (`src/process-kernel.c:2885-2889`), so a waiting
  parent's WAIT returns `-EINTR` and libc waits again: measure the round trips, then set it pending
  only when handled.
- `launching_pid` is one global (`:662,2778`) while EXEC compiles outside the launch chain: two
  compiles in flight can address the wrong terminal. Key it by pid.
- The supervisor ignores `dolly_process_worker_exited`'s result (`src/process-supervisor.mjs:544,892,998`).
- Check that every path that changes a file waits during a session save (`change_waits`): mmap
  writeback, `host/upload/kernel.c`.
- `process_dispatch` is 704 lines: split by operation family once `20261112-074504-kernel-streams`
  removes the per-kind branches.

## Done when

Each is fixed or measured and closed with the reason; the process and session suites pass.
