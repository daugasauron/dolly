# Slopyard's test hung after eight fixtures once, in the confirming round

- STATUS: OPEN
- PRIORITY: 255
- TAGS: bug,slopyard,0.1.5

Seen in the confirming round of 2026-11-05 (`integrate/2026-11-05` at 693b9842f, GPU stage,
`work/integrate/build/round-1105b-evidence/gpu-slopyard.log`): the first eight fixtures passed in
seconds each (air-traffic to dock-courier), then nothing until the stage's 2,400 s limit ended the
test. In the same images at 06:24 and 06:26 the test passed twice, 107 s each
(`slopyard-rerun-1.log`, `-2.log`), as it did in the tests branch's tree. Not attributed yet; not
retried away. The same round's other intermittent failure is [rts-arena's SIGPIPE](../20261104-212342-rts-sigpipe/TASK.md):
both appeared once in a round whose new parts are the kernel's signal dispositions, the
spawn request's signal state and applications assembled from packages.

Done when: the ninth fixture's hang is reproduced (a loop of the fixtures under load, as in a
round's GPU stage), its cause named and fixed, and the test passes 20 times in a row.
