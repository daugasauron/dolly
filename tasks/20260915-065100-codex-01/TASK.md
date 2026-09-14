# Investigate a deadline failure in a finite controller

- STATUS: OPEN
- PRIORITY: 300
- TAGS: game,runtime,bug

Live Marrowstep ID 48 was removed at world time 23678.7667 s, age 4256.8833 s,
with cause `controller`, detail `Controller deadline exceeded`, and up=0.999784.
Its finite, bounded gait had run for over an hour. This was a controller-limit
failure, not a fall. Pi released a replacement as ID 59; its original design and
history remain saved. Evidence: the 21:48:35 UTC mirror in
`build/blockwalker-walking/current-state/blockwalker-world.json` and Pi history.

`src/blockwalker/world.c` limits each QuickJS controller call by elapsed wall
time. Measure whether Worker descheduling, GC or clock syscall overhead can
consume the 4 ms allowance for an otherwise small bounded controller. Do not
assume the cause from this one event or simply raise the timeout. Consider a
deterministic execution budget if measurements support it. Preserve a strict
bound on runaway loops, memory, source size and available APIs.

Verify a finite controller across an induced scheduling pause and a real
runaway controller in a guarded browser, then rerun the populated world. Keep
the live creations and complete native Pi history intact.
