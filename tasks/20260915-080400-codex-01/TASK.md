# Inspect controller memory during practice

- STATUS: OPEN
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
