# Threaded Codex reaches sign-in about 2 s later

- STATUS: CLOSED
- PRIORITY: 210
- TAGS: codex,threads,performance,demo

Since Rust executables link threaded (`threads@0`, release candidate
`rc-2026-10-01`), Codex reaches its sign-in screen in about 2.8-3.6 s in roughly
70% of runs instead of 0.75-1.2 s. The gap sits right before Codex starts its
last two threads; restoring the timer-polled input did not help
(`20260930-230009-rust-threads`).

Done when: the cause is found with a trace and threaded Codex starts as fast as
the single-threaded build, or the remaining cost is measured and justified.

## Reproduction (2026-10-02, `rc-2026-10-02` images)

Fresh headless Chrome contexts load `/codex/`; the time is from
`dollyStatus = ready` until the terminal shows `Sign in with ChatGPT`
(polled every 25 ms). 20 runs: 697-774 ms in 8, 2574-3643 ms in 12; median
2742 ms.

## Trace

`console.log` timestamps (`performance.timeOrigin + performance.now()`) from the
supervisor and every process Worker, per syscall with its wait, poll timeout,
descriptors and readiness:

- Worker creation is not the cost: each thread is evaluated, configured and
  instantiated within 5-12 ms of its SPAWN, and Codex's module compiles once.
- The stalled period is busy. Codex initializes its SQLite state database
  through sqlx, whose connection worker is a tokio task on this target; every
  statement hands off between tasks on different tokio workers. A worker
  parked in tokio's I/O driver waits in `poll` on mio's waker pipe (fd 3) and
  signal pipe (fd 7); the handoff writes one byte to the waker pipe.
- The kernel defers that `poll`, and the supervisor retried deferred calls only
  on its 16 ms service tick, so each handoff waited 12-19 ms. Slow runs had
  165-210 such waker-woken polls (2.4-3.2 s waiting); the fast run had 46
  (0.59 s). Whether tokio unparks the driver-parked worker or one parked on a
  futex decides which mode a run lands in.
- The gap ends when the state database is ready; the TUI then starts its two
  blocking-pool threads, the "last two threads". The crossterm reader thread
  sits in `poll` on the terminal throughout and is not on the critical path.
- Check: retrying every deferred call after each completed syscall made 6/6
  runs reach sign-in in 958-1092 ms (with tracing on).

## Fix

The kernel sets `pipe_changed` when a pipe's bytes or ends change and exports
`dolly_process_take_wakeup` (`abi/dolly-supervisor-0.wat`). After each completed
syscall the supervisor takes it and retries the deferred calls at once; the
16 ms tick remains for timers and terminal input. Regular-file I/O leaves the
flag clear, so SQLite's file traffic adds only one export call per syscall.

No seed, image or process ABI change: image inputs stay
`sha256:9f7a44a720d0b8d1b6d84384f9951f62cab82ce975f6b51712b49b52d6defe65`.

## Measurements after the fix

- A/B in one Chrome on the same kernel and load, alternating the old and new
  supervisor, 20 pairs. Before: 769-3751 ms, median 3432 ms, 16/20 above 2 s.
  After: 790-1227 ms, median 838 ms, 0/20 above 2 s.
- 100 pipe round trips between two threads (`poll` then `read`): 3175-3206 ms
  before in Chrome and Firefox (one tick per handoff); 8-14 ms after.
  `test/fixtures/threads-pthread.c` now requires under 500 ms; it fails
  without the fix.
- Firefox, 8 pairs: before 2254-3679 ms (8/8 above 2 s); after 971-1077 ms,
  median 986 ms.
- Traced after the fix: Codex's main thread starts about 365 ms after ready
  (shell chain, then copying and compiling the 179 MiB executable, unchanged by
  threads); its last two threads start at about 866 ms instead of 2.0-2.9 s.
  Of 289 driver polls woken by the waker pipe in one run, 261 waited under
  2 ms and 28 waited 2-25 ms (not traced further; likely a busy runtime Worker).

## Closed (2026-10-02)

Threaded Codex now reaches sign-in in the single-threaded build's 0.75-1.2 s.
Verified with `node --test test/*.test.mjs` (251 pass),
`node test/threads-browser.mjs chromium firefox`,
`node test/core-browser.mjs chromium firefox`, `node --test
test/dolly.artifacts.mjs` and `npm run test:demos -- codex rust`, all passing.
