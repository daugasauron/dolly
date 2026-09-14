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
