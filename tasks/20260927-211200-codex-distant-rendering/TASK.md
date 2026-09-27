# Reduce distant visual grain without slowing the game

- STATUS: CLOSED
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

Checkpoint verification: `build/overnight-20260928/`.
Packaged Chrome/Firefox near/far screenshots inspected; normal aged Firefox
checks pass with all 163 original actors and no readbacks/errors. Final
Firefox samples: 99.8 / 105.7 / 115.6 / 111.2 FPS. The source-only matched comparison above remains
the evidence for shader cost; final package/source/preservation checks pass.
Local image: http://127.0.0.1:9097/blockwalker/.
