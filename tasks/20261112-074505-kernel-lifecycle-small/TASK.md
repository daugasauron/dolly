# Kernel lifecycle details: SIGCHLD round trips, launching_pid, ignored results, held changes

- STATUS: OPEN
- PRIORITY: 200
- TAGS: kernel,lifecycle,signals,audit,0.1.6

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, K3, K4).

## State (2026-11-12)

On `fix/batch`, waiting for its rebuild round:

- SIGCHLD stays as it is, measured: a kernel round trip costs 15 to 25 µs and a spawn and
  wait 3.0 to 6.0 ms (`tasks/20261006-093856-flock-stub`), so the three calls a default
  SIGCHLD adds (the interrupted call, INTERRUPT_POLL, SIGNAL_ACKNOWLEDGE) are 1 to 2.5% of a
  spawn. Dropping it in the kernel would lose a SIGCHLD that arrives while the mask blocks it
  and a handler is installed later, which Linux keeps: the kernel does not know the mask.
- `launching_pid` is gone: `dolly_terminal_write_bytes` takes the pid whose launch started the
  compile (`abi/dolly-supervisor-0.wat`), so two compiles in flight address their own terminals.
- `worker_exited` and `worker_failed` answer 0 for a process that already exited, as the
  contract says, and `-ESRCH` for one the kernel never had; the supervisor checks both results.
- Upload's chunks and rename wait during a session save (`dolly_kernel_change_waits`): the save
  lists `/tmp`, so a concurrent upload made it fail. mmap writes back through FD_PWRITE, which
  waits already. The page's own boot-file writes (nena's `/etc/dolly/enabled`) are synchronous
  exports and cannot wait; a save they race fails with its "save again" line.
- `process_dispatch` is split (2026-11-13, `fix/audit-0.1.6`): 133 lines, the table of every
  operation, each one's packet a function with only the parameters it uses. kernel-streams' descriptor
  record had landed (`2320b1a06`), so no operation branches on a descriptor kind there. A script moved
  the 41 bodies unchanged (no body retyped); image inputs unchanged (`46de2b9c…`). Passed in Chromium and
  Firefox: process, process budget, list and memory, shell, Slop, pty, console, threads, core,
  ending, terminal, cpp, host modules, boundary, session times, snapshot stream, upload. The suites
  that need the full catalog run in the round; close after them.

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
