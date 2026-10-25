# ClassiCube test: the panel's edge pixel differs in 1 of 2 runs

- STATUS: OPEN
- PRIORITY: 90
- TAGS: demo,flaky,0.1.4

## State (2026-10-25)

`node demos/classicube/test/classicube-browser.mjs` failed once in the full round of `500d4329`
(seed `debea04d`): `panel does not cover the game edges`, one of four sampled pixels reading
`[54,68,184]` where `[64,97,206]` was expected (`runClassiCubeProof`, reached from
`demos/classicube/test/classicube-browser.mjs:73`). It passed on the rerun right after it
(292.8 s), and in the round of 2026-10-24.

To do: loop it to measure how often, read which sample differs and what the game draws there
(sky, cloud or the panel's own edge), and wait for that frame instead of sampling once.

Done when: 10 runs in a row pass.
