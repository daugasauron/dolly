# Reduce distant visual grain without slowing the game

- STATUS: OPEN
- PRIORITY: 240
- TAGS: game,rendering,performance

User reports grainy graphics at long distances. Measure whether the dominant
cause is procedural surface detail, color dithering, or scene sampling. Compare
fixed near/far cameras and the same saved population in Firefox. Keep mechanical
silhouettes, readable team boundaries and close detail while suppressing detail
smaller than a screen pixel. Preserve approximately 100 FPS, using matched
baseline/candidate measurements rather than raising resolution blindly.

Source: src/blockwalker/scene.wgsl; evidence: build/overnight-20260928/.

Candidate uses native pixel centers, filters subpixel ground details, and fades
the coarse color palette/dither with distance. The old two-pixel quantization
still ran a full-resolution fragment shader. Actual GPU timestamps average
0.60 ms with the candidate versus 0.57 ms before; CPU preparation dominates.
Matched near/far/joint captures are in render-equivalence/. The final ordinary
Firefox replay measures 97–107 FPS across four matched views of the actual
20-minute world, with all 163 characters and no errors/readbacks
(render-optimized-v2/proof.json). Packaged image verification remains pending.
