# Improve hardware gameplay performance in 0 A.D.

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: performance,wasm64,gpu,0ad

Profile bare `zero-ad` on this PC, particularly Firefox, and improve frame time
without sacrificing input, audio, simulation correctness or browser containment.
Work is on `codex/0ad-baseline-20260923`, from Slopyard `aa28100`.

The original 12-second warmed Athens/Petra profile in Firefox 155 averaged
35.30 ms/frame, p95 82.88, p99 117.14, maximum 226.36. Hardware GPU work was only
0.14 ms/frame. The bottleneck was CPU/Worker traffic: 24,515 clock calls/s,
18.3 GPU packets/frame, 2.45 MB/frame and 11.5 ms/frame waiting for error scopes.
The equivalent final default-town profile averages 9.74 ms (103 FPS), p95 16.52,
p99 24.24; 2.04 packets and 0.47 MB/frame. Evidence:
`.cache/0ad/performance-{baseline,final-default}-firefox.log`.

Implemented:

- Process-local clocks, aligned to the kernel origin, retain a kernel signal
  checkpoint at least once/ms. Kernel checks also sample the process clock to
  avoid mixing rounded Firefox time origins. Commit `1f5e5e8`.
- Cache complete resource-group bindings across frames; retire unused entries.
  Creation/release falls from 461 to about 20 groups/frame in the quiet town.
- Stage aligned uniform ranges in Wasm and upload them together before submit.
- Skip identical buffer uploads and trim unchanged 4 KiB blocks from their ends.
  Selected-unit economy traffic falls to about 0.73 MB and 2.1 packets/frame.
- LARGE_BATCH advertises 1,024 commands within the same 1 MiB packet limit.
  Older providers retain the 256-command path. Timestamp storage covers every
  pass in a maximum batch; allocation, admission and ownership limits remain.
- Compile the engine and SpiderMonkey at O2 with standard SIMD128, without
  fast-math or relaxed SIMD. Device.o contains 280 SIMD instructions. Compiler
  changes alone have modest effects; batching and avoided uploads dominate.
- The packaged game's ordinary session FPS cap is 120, adjustable in settings.

Final packaged gameplay at 1024x768, hardware WebGPU, sound enabled:

| Browser / workload | Mean ms (FPS) | Median | p95 | p99 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Firefox 155, combat | 18.59 (54) | 17.02 | 28.66 | 44.10 | 46.86 |
| Firefox 155, economy | 13.43 (74) | 11.58 | 34.24 | 41.84 | 260.60 |
| Chrome 151, combat | 11.55 (87) | 10.34 | 17.96 | 23.29 | 26.97 |
| Chrome 151, economy | 9.70 (103) | 8.08 | 15.94 | 31.12 | 77.12 |

Combat includes a five-second warm-up after quickload. Economy measures 40 s of
training/construction with units selected and Petra active, including first-use
resources. Firefox has 161/2,977 economy intervals above 33.3 ms; Chrome has
26/4,123. GPU work remains 0.08–0.13 ms/frame. Peak bounded test-tree memory is
4.77 GB Firefox / 3.07 GB Chrome. These are substantial improvements, not a
claim of locked 60 Hz: selected-unit GUI updates and first-use resources still
cause hitches, especially in Firefox. The earlier combat checks measured about
47 ms Firefox / 24 ms Chrome, with less warm-up.
Evidence: `.cache/0ad/performance-final-{firefox,chromium}.log`.

Both browsers pass menu, selection/movement, quicksave/load, two civilian hires,
a completed house, Petra progression, audible PCM, two fresh processes and shell
recovery. The faster Chrome run exposed a test that clicked the training panel
before it updated; selection steps now wait for UI settling rather than only
three rendered frames. GPU resources and audio queues are released on exit.

Verification:

- Chrome and Firefox core/process tests: 4,096 nondecreasing raw clock reads,
  malformed requests, absolute sleeps, clock-only SIGINT/SIGTERM, lifecycle,
  ABI/DSO/errno and denied host access. `performance-{core,signals,abi}-test.log`.
- Freshly built GPU SDK compiles and executes a 1,024-write batch, checks pixels,
  texture/depth/indexed drawing, interrupts and restarts. Provider tests exercise
  1,024 records with over 2,000 timestamp queries, reject 1,025 records, and reject
  a malformed final record before allocation. `performance-gpu-final.log`.
- The new engine runs against the pre-extension provider in Firefox.
  `performance-legacy-firefox.log`.
- Deterministic combat replay, controlled movement, house/training/gathering and
  Petra save/load continuation, including fresh processes, pass at O1 and O2.
  Combat replay hash: `be99497b21b9cb86d3a1478d2e2e09a6`. Independent economy runs
  randomize the AI leader name, so compare their saved continuations within the
  same setup. `performance-simulation-sm-o{1,2}.log`.
- Optimized SpiderMonkey realms, GC, callbacks and structured cloning pass in
  two fresh processes. `performance-sm-check-browser.log`.
- All 277 source tests and 23 artifact checks pass. The canonical patch rebuilds
  all 41 modified/new files from pristine upstream with fuzz disabled.
  `performance-{source,artifacts}-final.log`.

Diagnostic audio compiler changes, browser-side draw-state caching and larger
individual upload chunks showed no useful gameplay gain and were removed.
No temporary native phase instrumentation remains. Reproduce gameplay with
`node test/0ad-graphics-browser.mjs zero-ad hardware firefox` (or `chromium`),
inside a bounded memory scope; run one physical GPU test at a time.

The selected `zero-ad,audio-sdk,gpu-sdk` image union rebuilt in 37.2 s using the
existing runtime. Final engine SHA256:
`3ce68297878a1bbb2f2cf19dc37ef0afa38ad5011a639574c17e034af2a8b7d1`.
Completed on implementation commit `ad9af62`. Local release
`bc908afa2be65ad248c1b06f00fa2c976aec9c1d0db77a27e5d5de325c6624b8`
passes browser inventory acceptance for all 12 selected images. Archive:
`build/0ad/dolly-zero-ad-pages.tar.gz`, SHA256
`c60aa5eb130ca1d22695164fed41c08585dd4c98ee08df99dcac79d13930a393`.
Evidence: `.cache/0ad/performance-release-package.log` and release `acceptance.txt`.

Fresh Firefox 155 at `http://127.0.0.1:42727/zero-ad/` verifies the packaged
engine hash, bare `zero-ad`, a nonfallback hardware WebGPU adapter, selection,
pointer exit without runaway scrolling, and clean shell/audio recovery with no
page errors. Screenshot comparison confirms the town remains visible after eight
seconds with the pointer outside. Evidence: `.cache/0ad/performance-release-firefox.log` and
`.cache/0ad/browser/release-firefox-{selected,pointer-outside}.png`.
