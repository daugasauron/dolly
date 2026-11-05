# Slopyard's test hung after eight fixtures once, in the confirming round

- STATUS: OPEN
- PRIORITY: 255
- TAGS: bug,slopyard,0.1.5

## State (2026-11-05 10:50, branch `fix/intermittent-1105`)

Reproduced once, at an upload, not in the compiler or the fixture. Cause not yet named.

- `build/flaky-evidence/slopyard-loop.mjs` runs the test's steps (upload, compile in
  `slopyard-build`, run) in passes over the 17 fixtures, each step with a 300 s deadline, on Xvfb
  :145 in the GPU lock, beside the candidate round's builds and RTS loops. 243 fixtures, one hang:
  page 1, pass 6, the fifth fixture's `upload /tmp/fixture-4.c` (90th upload of the page).
- At the hang the page showed one upload dialog, "Uploading slopyard-controller-arguments.c,
  0.0 of 0.0 MiB" (the file the test chose, no progress after it); the supervisor's table:
  `upload` (pid 639) deferred in its one call, `DOLLY_UPLOAD_FILE` (57), for 300 s, the shell in
  WAIT. No transfer had started: the page's progress never moved.
- The round's hang has the same place: right after a fixture passed is the next fixture's upload.
- The loop now runs again with the upload module's two sides traced (request, cancel and complete
  words, the dialog's events, each chunk).

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
