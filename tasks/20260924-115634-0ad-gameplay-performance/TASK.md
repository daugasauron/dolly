# Audit 0 A.D. gameplay and performance across browser hardware

- STATUS: OPEN
- PRIORITY: 250
- TAGS: performance,wasm64,gpu,0ad

Continue on the Blockwalker-based `codex/0ad-baseline-20260923` branch through
2026-09-25 07:00 JST (2026-09-24 22:00 UTC). Starting release: `bc908afa`,
implementation `ad9af62`. LAN hosting was cancelled before any service changes.

Requirements:

- Reproduce and fix terminal text showing through graphics.
- Profile and reduce selection/drag-box stutters, including tail latency.
- Start the image at the upstream main menu; single-player setup must create
  playable matches with complete assets and without missing-texture errors.
- Audit performance and add supported gameplay features with maintainable
  interfaces and upstream source/configuration preferred over special cases.
- Verify multiple browsers and resource/performance conditions, including lower
  specifications; do not infer portability from this PC's high-end GPU alone.
- Preserve input, audio, saves, simulation correctness, shell recovery and the
  browser security boundary. Publish and verify a fresh local release.

Run one physical GPU workload at a time, with bounded browser memory. Record
measurements and evidence here before closing; average FPS alone is insufficient.

Initial Firefox 155 reproduction finds GPU release fences dominate drag stutters:
211 ms worst frame during the first drag, 208 ms during repeated dragging, and a
644 ms frame when the selection panel first populates. Deferred resource cleanup
invalidates handles immediately while retaining byte/object charges until queue
completion. With the original engine unchanged, first-drag maximum is 20.9 ms;
repeated-drag p99/max are 26.9/36.9 ms, versus 37.1/208.0 before. The complete
27-second sample's p99 improves 42.1 to 31.6 ms; maximum remains 206 ms during
first-use UI loading. Stage boundaries omit their first interval; the complete
sample includes those transitions. Evidence: `.cache/0ad/selection-{baseline,
retirement-final}-firefox.log` and matching frame JSON. An experimental native
buffer-growth change showed little additional benefit and was removed.

Real-browser GPU checks hold completion notifications to prove nonblocking
release, stale-handle rejection, retained allocation/object charges, reclamation,
and close/restart without duplicate credits. Existing texture/depth/indexed,
1,024-command, hostile-packet and forced-termination checks also pass in
Chrome/SwiftShader and Firefox hardware. Evidence:
`.cache/0ad/retirement-gpu{,-firefox}-proof.log`.

The user confirms text shows through during normal play. Initial 1024x768
Firefox screenshots over a magenta underlay show no visible leakage; investigate
the installed Firefox 155.0.1 and different display sizes/scales next.
The content package contains only two map closures and Athens, while the menu
exposes broader choices. All upstream assets recompress losslessly to about
1.79 GB, above the current 1 GiB snapshot limit; measure packaging/memory options
before choosing a complete-content approach. `.cache/0ad/content-sizes.log`.
