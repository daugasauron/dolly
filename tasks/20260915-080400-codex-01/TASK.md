# Inspect controller memory during practice

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: game,agent,diagnostics

Pi writes useful feedback diagnostics into `memory` (phase, integrators,
support duration, abort count), but `inspect_program` currently returns only
source/name/rate and practice state returns physics sensors. Only a released
creature's saved world contains its controller memory. The independent 90 s
Sidelight VII replay used that saved memory to locate the landing stall at
31.4667 s; Pi cannot inspect the equivalent state while keeping a prototype in
practice. This impedes tuning PID and multi-stage gait controllers.

Expose a bounded snapshot of current practice controller memory through the
existing inspection or trial result. Keep physics and source unchanged; retain
QuickJS computation/heap bounds and handle cyclic or unserializable memory and
runaway getters without hanging the game or flooding model input. Reuse the
existing serialization path where it reduces code. Verify actual counters or
phase state after timed practice, plus reset and failed serialization. Build
and exercise the C change inside Dolly, then bundle with the longer-trial change.

`inspect_program` now includes a detached JSON `memory` snapshot (8 KiB maximum)
and optional `memoryError`; the final `program_trial` result includes it too.
Reset/stop clear the practice state. Serialization reuses the saved-world path,
under the existing controller computation and heap limits. Failed serialization
clears the exception and leaves the controller usable. Saved-world memory keeps
its existing size behavior; only inspection output has the 8 KiB bound.

The focused real-browser fixture compiled the C inside Dolly and verified 120
physics/controller ticks, phase/time values, detached copies, fresh/reset memory,
cycles, oversize, BigInt, undefined toJSON, throwing getters and runaway
getters/toJSON. Every failed snapshot left the next physical controller step
working. All 45 bundled controllers also passed 1000 calls, a finite controller
survived an injected 50 ms wait, and five runaway cases stopped. Evidence:
`build/blockwalker-memory-check.log` and `blockwalker-controller-check/`.

The newly packaged image then ran unchanged Sidelight XI for 5400 physics ticks
in 90.016 wall seconds, reading 89 memory snapshots and three actual GPU images.
Final poses match Pi's earlier result (up=0.9970898, distance=1.1472713). Its memory
reveals zero completed cycles, lift abort at 15.933 s, landing timeout at 22.95 s,
and recovery timeout at 34.95 s. Remaining upright did not establish walking.
Evidence: `build/blockwalker-memory-trial/{memory-trial,proof}.json` and PNGs.

The actual resumed Astra/xhigh Pi used the new result: its compact XII audit
returned 2961 JSON bytes, identifying transfer/recovery timeouts
without changing the physical result. See `build/blockwalker-damped-trial/pi-trial-proof.json`.
