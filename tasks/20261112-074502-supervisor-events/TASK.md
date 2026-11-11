# The kernel decides, the host executes: one event export in place of the supervisor's policy

- STATUS: OPEN
- PRIORITY: 380
- TAGS: processes,architecture,abi,lifecycle,audit

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, A4). The owner accepts contract changes (2026-11-12) and wants a
second host (Donna, 2026-11-11) to be possible without copying policy.

## State (2026-11-12)

Filed. Related to `20261112-074501-modules-modular`, whose generic event export is the first step.

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
