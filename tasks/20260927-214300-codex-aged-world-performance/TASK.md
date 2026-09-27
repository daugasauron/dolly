# Restore performance in a world that has been running for a while

- STATUS: OPEN
- PRIORITY: 330
- TAGS: game,performance

User sees 40–50 FPS after initially seeing roughly 100. Replay the real
20-minute save with all 163 characters; keep controls at 20 Hz and physics at
60 Hz/eight substeps/four workers. Do not remove actors to make the test pass.

Initial CPU profile: controllers account for about 83% of simulation time;
constructing sensors is about 40%, Lua about 27%, physics about 8%. Repeated
dynamic-body observation distances recalculate the same positions many times.
The candidate caches poses/distances only during a controller phase. Every
articulated pair matches the uncached distance exactly before and after motion.

Normal Firefox replay, matched cameras and the same saved population:
baseline 60.7/61.3/69.4/66.8 FPS versus cached 86.0/89.1/97.5/96.9 FPS
(near/far/far focus/near focus). Earlier runs were slower, so retain the paired
results and avoid treating either single run as a machine-wide guarantee.
GPU timestamps average about 0.57 ms per frame. CPU scene-tree construction
averages about 1.6 ms per frame and recomputes oriented bounds at every depth;
cache those bounds once per frame and verify rendered output.

Evidence: build/overnight-20260928/{baseline,render-baseline,render-cached,
render-profile,profile}; detailed CPU probes are in
build/action-front-20260927/profile-{fresh,mature,cached}/.
Completion requires final normal-game browser checks, unchanged observation and
rendering results for the caches, and a packaged local checkpoint.

Final source-only replay with both caches and the distant shader measures
97.4/101.6/106.5/106.8 FPS at the same four views. All 163 starting characters
remain over 44.6 simulation seconds, with no controller/browser errors and no
framebuffer readbacks. Evidence: render-optimized-v2/proof.json. Integration
with the gameplay changes and the packaged local image still needs verification.

The bounds cache now passes three byte-identical fixed GPU captures (near, far
and joint) in Firefox, with no simulation drift. Evidence:
build/overnight-20260928/render-equivalence/proof.json. Preliminary ordinary
rendering averages 1.28 ms for tree construction, versus about 1.6 ms before.
