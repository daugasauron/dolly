# Threaded Codex reaches sign-in about 2 s later

- STATUS: OPEN
- PRIORITY: 210
- TAGS: codex,threads,performance,demo

Since Rust executables link threaded (`threads@0`, release candidate
`rc-2026-10-01`), Codex reaches its sign-in screen in about 2.8-3.6 s in roughly
70% of runs instead of 0.75-1.2 s. The gap sits right before Codex starts its
last two threads; restoring the timer-polled input did not help
(`20260930-230009-rust-threads`).

Done when: the cause is found with a trace and threaded Codex starts as fast as
the single-threaded build, or the remaining cost is measured and justified.
