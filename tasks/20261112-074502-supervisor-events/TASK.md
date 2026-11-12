# The kernel decides, the host executes: one event export in place of the supervisor's policy

- STATUS: OPEN
- PRIORITY: 380
- TAGS: processes,architecture,abi,lifecycle,audit

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, A4). The owner accepts contract changes (2026-11-12) and wants a
second host (Donna, 2026-11-11) to be possible without copying policy.

## State (2026-11-12)

On `fix/events` (from `fix/batch`), tested on `test/events` (main with its non-seed
prerequisites) in work/events. `abi/dolly-supervisor-0.wat`: `dolly_process_next_event() -> i64`
(kind << 48 | value << 32 | PID: LAUNCH, INTERRUPT with the signal, TERMINATE, WAKE) and
`dolly_process_service_milliseconds() -> f64` (when the kernel next has a grace, a deadline or an
alarm due) replace `next_launch`, `take_raised`, `take_interrupt`, `take_wakeup`,
`deadline_remaining`, `exit_signal` and `signal`. The kernel now decides:
- a delivered signal's 500 ms grace (`DOLLY_KERNEL_SIGNAL_GRACE_NANOSECONDS`), armed when a
  signal reaches a running program, cleared by its acknowledgement, at EXEC and at exit; a signal
  pending across EXEC arms it when the new program starts;
- a timed spawn's deadline: its descendants by SIGKILL, deepest first, then itself with 124;
- Ctrl-C's targets (an interactive owner's commands in its place, else it and its descendants);
- a signal that ends a process passing to its descendants that do not have it yet;
- an orphan's reaping at retirement (`host_waits` marks the processes the host collects).
The supervisor no longer parses SPAWN's or SIGNAL's responses or SIGNAL_ACKNOWLEDGE, holds no
grace or deadline timer and no signal policy: 1,102 lines to 1,016. It keeps the browser's own
limits (Worker count, memory budget, reclamation, the mailbox seal) and its 16 ms tick for the
page's services, and asks for events after each call, each ending and when the kernel's due time
comes. Left: src/process/signal.c and host/pty/dolly-pty-0.wat still say "the supervisor ends
the process": both are in identities (the seed, pty@0's digest), so they change with the next
full round. Donna is told when it lands.

## Found

`abi/dolly-supervisor-0.wat` has 31 functions and `abi/dolly-image-0.wat` 14. The 1,098-line
supervisor interprets five operations' responses by number and holds lifecycle policy as constants
(500 ms signal grace, 5 s spawn patience, 1 s mailbox seal, 56 Workers, 4 GiB budget, a 16 ms tick).
Process state is in the kernel's `process_table` and the supervisor's `processes`, kept in step by
eleven calls. Donna's supervisor is its largest file (1,867 lines).

## Do

`dolly_process_next_event() -> (kind, pid, value)` with kinds launch, deliver-signal, arm-timer,
terminate, retire replaces `next_launch`, `take_alarm`, `take_interrupt`, `take_wakeup`,
`deadline_remaining`, `deferred_milliseconds` and the pty pair; grace and patience become kernel
constants; the host keeps compiling, starting and ending Workers and sleeping. A contract revision
(`dolly-supervisor-1`).

## Done when

The supervisor holds no lifecycle constant but the browser's own (Worker count, memory budget),
the lifecycle suites pass in Chromium and Firefox, and Donna's supervisor shrinks accordingly.
