# Investigate a deadline failure in a finite controller

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: game,runtime,bug

Live Marrowstep ID 48 was removed at world time 23678.7667 s, age 4256.8833 s,
with cause `controller`, detail `Controller deadline exceeded`, and up=0.999784.
Its finite, bounded gait had run for over an hour. This was a controller-limit
failure, not a fall. Pi released a replacement as ID 59; its original design and
history remain saved. Evidence: the 21:48:35 UTC mirror in
`build/slopyard-walking/current-state/slopyard-world.json` and Pi history.

`src/slopyard/world.c` limits each QuickJS controller call by elapsed wall
time. Measure whether Worker descheduling, GC or clock syscall overhead can
consume the 4 ms allowance for an otherwise small bounded controller. Do not
assume the cause from this one event or simply raise the timeout. Consider a
deterministic execution budget if measurements support it. Preserve a strict
bound on runaway loops, memory, source size and available APIs.

Verify a finite controller across an induced scheduling pause and a real
runaway controller in a guarded browser, then rerun the populated world. Keep
the live creations and complete native Pi history intact.

## Reproduction and candidate, 07:09 JST

The in-Dolly C probe wrapped the real QuickJS interrupt callback with one 50 ms
`nanosleep`, then resumed the original check. The unchanged Marrowstep controller
failed at call 57 with the wall deadline. With a bounded number of QuickJS
execution checkpoints it completed all 1,000 calls across that same pause.
This reproduces the scheduling-sensitive failure class; the exact original
pause/GC event at live age 4256.9 s was not recorded.

All 45 bundled controllers completed 45,000 fixed-pose calls. A 240-tick actual
physics replay produced byte-identical complete world/controller state before
and after (SHA-256 `d028d35d32e98852d19e7a49d5915319a167548814f64ef72d5fcebb50ae0fb3`).
Evidence: `build/slopyard-controller-probe/{wall,fuel}.csv`, `*-world.json`,
`build/slopyard-controller-compare.log`. Both variants were compiled inside
Dolly under a 4 GiB/no-swap browser scope.

The candidate allows two engine interrupt checkpoints, then fails on the next.
Initialization, calls and controller-memory serialization/restoration reset the
same budget. The 4 MiB heap, 128 KiB stack, 16 KiB source and API set are unchanged.
Ordinary calls used at most one checkpoint in this probe. The comparison's
45,000 calls took 1167.8 ms before and 731.1 ms after; this is controller work,
not total game FPS. Removing per-call clock syscalls contributes to the saving.

Runaway loops, regex backtracking, output getters and initialization were stopped.
Repeated `Date.now()` calls also stop, but take about 90–99 ms because each clock
call crosses the existing kernel interface. This is an execution budget, not a
4 ms wall-time guarantee; the tool description now says so and directs programs
to simulation time. Empty loops stopped in 0.07–0.17 ms, regex in 1.8–2.0 ms.

The focused regression is `test/slopyard-controller-browser.mjs` with the
small C fixture `test/fixtures/slopyard-controllers.c`. It uploads current app
sources and compiles the fixture inside Dolly, without rebuilding an image.
It passed 45,000 ordinary calls, the paused controller and five runaway cases
(`build/slopyard-controller-check.log`). Full image/native and live update
verification is recorded below.

## Browser and live update verification

The rebuilt image passed the existing embedded/browser integration, including
runaway removal, feedback flight, water, magnetic cargo and restored world.
The focused source-only C probe passed again after the final change. All C
compilation ran inside Dolly. Logs: `build/slopyard-controller-integration.log`,
`slopyard-controller-check.log`, `slopyard-controller-update.log`.

An isolated restore of the actual paused 52-object/1361-part world preserved
controller source, memory, frequency, seed, IDs and three attachments with zero
pose error. It exposed an old double-to-integer truncation: saved seconds times
60 could be one ulp below an integral tick. Round to the nearest integer on load;
the regression retains both affected step counts (1032202 and 261688).
Evidence: `build/slopyard-walking/controller-memory-restore.json`.

The live update preserved all five backed-up files byte-for-byte, including the
complete 309,962,807-byte native Pi history (1,481 JSONL entries). Its SHA-256 is
`a7d0c76b992095eac8cb6191ba46f14b80cdd2f78f17cd04ef72f572828c160f`.
A chunked full recovery archive and unchanged-file proof are in
`build/slopyard-walking/controller-{restore,updated}-proof.json`.
Live continuation is verified at 22:29:48 UTC: world time advanced from
25482.8167 to 25733.5167 s, all 52 objects remain, and removals remain nine.
Requests reached 381/380 completed with actual `gpt-6-astra` / `xhigh` metadata;
Pi successfully built, drove and tested the next biped revision. The native
history grew to 312,153,420 bytes while retaining the exact complete pre-update
prefix. Evidence: `controller-continuation-proof.json`, `requests.jsonl` and the
current-state mirror. This closes the scheduling-sensitive controller failure;
longer biped and population work continues in its own issues.
