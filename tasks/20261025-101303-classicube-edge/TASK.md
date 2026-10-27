# ClassiCube test: the panel's edge pixel differs in 1 of 2 runs

- STATUS: CLOSED
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

## Closed (2026-10-27, `50a7f220`): the check compared two frames of a moving world

Looped on `main` `f9cbff51` with every try of the check logged (`work/flaky/build/flaky-evidence/`):
in 3 runs, 9 checks made 39 tries; the top-right sample, (600,20), differed in 22 of them by
up to 146 levels, the two bottom corners in 13 and 8, and one check passed only on the
16-level tolerance after its twelve tries. The world is generated anew for each run, and
where the player spawns on water the view is the water's surface from below, animated and
bobbing (the round's `[54,68,184]` against `[64,97,206]` is that blue), and the game publishes
about 35 frames a second (frame 63 to 229 in 4.8 s). The check read the game's `view.rgba` from a session
snapshot and then the page's display, after decoding the snapshot, so the two were frames
apart; the game and the viewer draw correctly.

The display is now taken just before the snapshot, so the two differ only when the game
published a frame in between, and the check waits for an exact match (45 s) without a try
count or a tolerance. With the try log: 21 checks in 7 runs, 20 exact at the first try and
one at the third (no frame yet, then a player settling after spawn). Without it:
`node demos/classicube/test/classicube-browser.mjs` 10 of 10 in a row (306 to 484 s).
