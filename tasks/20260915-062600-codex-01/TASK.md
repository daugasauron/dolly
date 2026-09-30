# Measure deferred timer wakeups during game rendering

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: runtime,performance,timers

Slopyard tree construction improved from 1.31 to 0.47 ms/frame, with identical
GPU images, but total FPS still varied between roughly 37 and 57. The GPU itself
measured about 0.4 ms. Isolating the live Pi world did not eliminate variation.
Do not attribute it to timer scheduling yet.

`ProcessSupervisor` retries deferred syscalls on a 16 ms service interval;
Janis uses deadline-based poll waits for its 16 ms frame timer. Measure actual
1–16 ms poll/sleep wakeups in Dolly, idle and with the real game workload, then
compare frame pacing. Keep deadlines canonical in Wasm and preserve process
lifecycle/cancellation. Prefer deadline-aware wakeups over faster idle polling.
Evidence so far: `build/slopyard-isolated-compare/` and the linked
[profiling task](../20260915-060200-codex-01/TASK.md).

## Reproduced in the browser

`build/slopyard-timers-check.mjs` runs actual `Dolly.fsPoll` and Janis timers,
then renders the full 42-object world. It uses the unchanged built runtime and
image, no mocks and no HTTP calls. The guarded browser run passed with no removals.
Evidence: `build/slopyard-timers/timers.json` and matching browser log.

Forty sequential waits per delay measured: 1–12 ms poll/timeout requests wake at
about **16 ms**; 16 ms requests wake at about **32 ms**. Zero-time polls return
immediately. These are actual observed wakeups, consistent with the supervisor's
16 ms retry interval. The test ran with the separate live Pi world active.

Five three-second frame trials at timer periods 16/8/4/0/16 ms produced average
callback gaps 22.84/16.56/16.13/12.66/28.88 ms. Simulation continued in real time.
Changing the game to poll faster would conceal the underlying short-wait cost;
keep the game timer unchanged and measure a deadline-aware supervisor change.
A service callback must still ask the kernel to decide whether a wait is ready,
including cancellation and clock changes. No production scheduling edit yet.

A small candidate is a typed internal supervisor export returning the remaining
wait from the most recent dispatch. The kernel can set it while validating a
finite terminal/poll/display/sleep request; default -1 means no timed hint.
The supervisor can arm a cancellable process wakeup when the remaining wait is
shorter than its next service tick, then retry the original request. Keep the
16 ms terminal/service interval. Clear the wakeup on completion and retirement.
Update the canonical supervisor WAT alongside any new internal export; ordinary
program imports and the browser's network/GPU capabilities need not change.
This is an implementation candidate, not yet built or verified. Check real
clock sleep, fd readiness, signals and process retirement in addition to the
same idle/populated timing probe before closing.

## Implemented and verified, 2026-09-15 07:44 JST

The kernel now returns a typed `dolly_process_deferred_milliseconds` hint from
the last dispatch. Valid finite poll, terminal, display and sleep requests set
it; each dispatch resets it. The supervisor schedules one cancellable wakeup
only for the last 16 ms of a wait. Every wakeup replays the original request
through kernel validation; signals, completion and retirement clear it. The
ordinary 16 ms service interval remains. No public process ABI or outer import
changed; all 29 browser imports retain identical names and types.
The canonical internal WAT has the added `func()->f64` export.

Two before/after pairs used the same fresh 45-object/1211-part image, unchanged
C game and 16 ms frame timer, with the separate live Pi world active. Mean
1 ms polls fell from 15.66 to 1.40 ms; 2 ms from 15.90 to 2.79 ms; 16 ms from
31.15 to 17.24 ms. The 12 ms waits still average 15.66 ms, so wakeups are not
universally precise. Across four populated 16 ms timer windows, mean gaps were
26.75–28.92 ms before (34.6–37.4 FPS), and 17.24–18.32 ms after (54.6–58.0 FPS).
Simulation followed wall time and all 45 objects survived each replay. These
are shared-host measurements, not isolated GPU benchmarks. Evidence:
`build/slopyard-timer-comparison.json`, `slopyard-timers-{before,after}/`
and `slopyard-timers-recheck-{before,after}/`.

The existing core browser suite passed in Chromium (20.6 s) and Firefox
(28.3 s), including compiled C/C++, readiness, pipes, interruption, descendants
and HTTP cancellation. The C poll probe now checks that short absolute sleeps
on both monotonic and real-time clocks do not return early. All userspace C was
compiled inside Dolly. The focused game editor browser passed joint keys,
cameras, underside placement, remapping, materials, anchoring and import/export.
Logs: `build/slopyard-timer-{core,editor,abi}.log`. Typed supervisor exports
and exact browser imports passed; the import-review JSON and export test also
now include the already-existing GPU boundary that their old expectations missed.

Only the bootstrap kernel was rebuilt with the pinned external toolchain.
The image-input identity stayed unchanged, so existing images were reused.
The running saved Pi browser still uses its earlier loaded supervisor; defer
its refresh until the current long Astra request completes, preserving the
full world and native history before migration. Fresh preview loads use this
verified runtime.
