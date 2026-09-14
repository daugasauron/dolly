# Measure deferred timer wakeups during game rendering

- STATUS: OPEN
- PRIORITY: 200
- TAGS: runtime,performance,timers

Blockwalker tree construction improved from 1.31 to 0.47 ms/frame, with identical
GPU images, but total FPS still varied between roughly 37 and 57. The GPU itself
measured about 0.4 ms. Isolating the live Pi world did not eliminate variation.
Do not attribute it to timer scheduling yet.

`ProcessSupervisor` retries deferred syscalls on a 16 ms service interval;
Janis uses deadline-based poll waits for its 16 ms frame timer. Measure actual
1–16 ms poll/sleep wakeups in Dolly, idle and with the real game workload, then
compare frame pacing. Keep deadlines canonical in Wasm and preserve process
lifecycle/cancellation. Prefer deadline-aware wakeups over faster idle polling.
Evidence so far: `build/blockwalker-isolated-compare/` and the linked
[profiling task](../20260915-060200-codex-01/TASK.md).

## Reproduced in the browser

`build/blockwalker-timers-check.mjs` runs actual `Dolly.fsPoll` and Janis timers,
then renders the full 42-object world. It uses the unchanged built runtime and
image, no mocks and no HTTP calls. The guarded browser run passed with no removals.
Evidence: `build/blockwalker-timers/timers.json` and matching browser log.

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
