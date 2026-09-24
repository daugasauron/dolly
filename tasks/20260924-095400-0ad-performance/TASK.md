# Smooth hardware gameplay in 0 A.D.

- STATUS: OPEN
- PRIORITY: 250
- TAGS: performance,wasm64,gpu,0ad

Profile bare `zero-ad` in Firefox on this PC and improve steady gameplay and
frame pacing. The completed merge-polish baseline measured 47 ms/frame in
Firefox and 24 ms/frame in Chrome combat, with sound enabled and a hardware
WebGPU adapter. The user expects smooth play on their strong hardware.

Measure default Athens/Petra and combat separately: warm-up, frame distribution,
CPU work, provider waits and GPU duration. Prefer batching and measured compiler
improvements; do not trade simulation correctness or input/audio behavior for
benchmark speed. Aim for 60 Hz gameplay, report remaining long-frame causes,
and verify actual interaction and deterministic save/load after changes.
Keep browser runs bounded and run only one test GPU workload at a time.

The 12-second warmed Firefox 155 default Athens/Petra profile measured mean
35.3 ms, median 26.4, p95 82.9, p99 117.1, maximum 226.4. Hardware GPU timestamps
sum to only 0.14 ms/frame. There are 18.3 packets/frame and 11.5 ms/frame waiting
for WebGPU error scopes. Process-call instrumentation finds 24,515 clock reads/s
consuming 313 ms/s in Worker round trips; GPU operations consume 523 ms/s.
The native profiler attributes 31.3 of 37.1 ms/frame to rendering.
Evidence: `.cache/0ad/performance-baseline-firefox.log`,
`.cache/0ad/parallel-scopes-firefox-{engine-profile.txt,syscalls.json}`.

Parallel error-scope pops alone make little difference (34.5 ms/frame). Serving
clock reads in the process Worker, with a kernel check every millisecond for
signals, reaches 24.9 ms/frame, p95 33.8. The browser regression test caught
backwards monotonic timestamps in Firefox when mixing Worker clocks: successful
kernel checks now also sample the process clock, preserving one source for all
valid reads. The kernel time origin still aligns absolute deadlines.

Caching complete resource-group bindings across frames, discarding those unused
in the current frame, reduces group creation/release from 461 to 20/frame and
packets from 18.2 to 10.1. Firefox reaches mean 19.3 ms, median 18.5, p95 30.0,
p99 38.8, max 57.2, with audio active and unchanged GPU time. Evidence:
`.cache/0ad/performance-groups-firefox.log`. Further optimization and behavioral
verification remain open. An O2/SIMD engine rebuild is in progress; no SIMD
performance claim yet.

Clock changes pass the full core browser checks in Chrome 151 (26.7 s) and
Firefox 155 (34.9 s), including 4,096 nondecreasing raw monotonic reads,
malformed clock requests, and absolute sleeps in both clock domains. Canonical
process-lifecycle checks pass with added clock-only SIGINT/SIGTERM handling;
process ABI/DSO/errno checks and all 277 source tests pass. Evidence:
`.cache/0ad/performance-{core,signals,abi,source}-test.log`.
