# Firefox: a gpu@0 surface draws no frame once it is sized again

- STATUS: OPEN
- PRIORITY: 150
- TAGS: gpu,firefox,browser,core,0.1.8

Found on 2026-11-17 by the planet's touch test (`feature/planet`, task
`20261116-223911-planet-day`): with the game sizing its window to the page, `__dolly.gpu`
reported the new size and its frame count stayed at 2, in Firefox 159 (the installed snap, NVIDIA
RTX 5070). Chrome draws on. So the planet sizes its window only on a screen held upright, which
a phone needs, and the upright part of its test runs in Chrome.

`host/gpu/worker.mjs` sets the canvas's size and takes its current texture
(`surfaceTexture`).

Done when a surface drawn at one size and then at another draws on in Firefox, shown by a run in
both browsers, and the planet's test can size its window in Firefox.
