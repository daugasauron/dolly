# Slopyard's test hung after eight fixtures once, in the confirming round

- STATUS: OPEN
- PRIORITY: 255
- TAGS: bug,slopyard,0.1.5

## State (2026-11-05 13:20, branch `fix/intermittent-1105`)

Reproduced once, at an upload; not reproduced again with the upload module traced. Cause not
named; nothing changed. The hang is the upload's: the test waits on `upload` without a limit.

Counts (image inputs `b9e16e76`, the candidate's; `build/flaky-evidence/`):

| run | uploads | hangs |
| --- | --- | --- |
| `slopyard-loop.mjs`, headful Chrome with Vulkan on Xvfb :145 in the GPU lock: upload, compile, run per fixture, 300 s a step | 243 | 1 |
| the same with the upload module traced | 850 | 0 |
| `slopyard-browser.mjs`, 20 runs in a row, traced (18 uploads a run and the game's imports) | 420 | 0 (20 of 20 passed) |
| the loop in headless Chrome (software WebGPU) | 935 | 0 |
| `upload-loop.mjs`, headless: an upload after a short threaded fixture | 2305 | 0 |

The one hang (page 1, pass 6, `upload /tmp/fixture-4.c`, the page's 91st upload): the page
showed one dialog, "Uploading slopyard-controller-arguments.c, 0.0 of 0.0 MiB": the test's file
was chosen and no progress came after it. The supervisor's table every 20 s for 300 s: `upload`
deferred in its one call, `DOLLY_UPLOAD_FILE` (57), the shell in WAIT; so the kernel never got a
chunk (`kernel.c` answers once `chunk` passes `consumed`). Between the page's choice and the first
chunk lie only the Worker's side: the answer to `upload-choose` (a `File` posted from the page)
and its read (`file.stream()`, a BYOB reader, `transport.mjs`). The round's hang sits at the same
step (right after a fixture passed is the next fixture's upload) with timings equal to the
reruns', so load is not what it needs.

Ruled out by reading and a model: the module's own logic. `upload-sim.mjs` (scratch, not kept)
drives `upload.mjs`'s Worker side against a kernel modelled on `kernel.c` and a page answering in
order: 1000 transfers, none lost. Out of order (a late `upload-close` reaching the next dialog) it
cancels transfers but never hangs them; postMessage keeps that order.

Next time: trace these lines (they were in this tree, uncommitted): the Worker's `service()`
request and cancel changes; `poll()` start, the chosen file, each `reader.read()` and `publish()`
with the mailbox words, `finally`; the page's `upload-choose` (open dialogs, previous controller),
the input's `change`, `upload-close`; the supervisor's deferred calls by process. They tell
whether the answer or the read is lost.

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

## Lessons

- A step with no limit turns one lost message into 40 minutes of a round and no evidence. The
  loop's 300 s limit per step, with the process table and the page's state captured at it, is
  what made the one occurrence readable; the test itself waits forever.
- The rate decides the method: 1 in about 1,500 uploads on the GPU path, 0 in about 3,200
  headless. Tracing must be in place before the long loop starts, and saved whole at the
  failure: the first hang's full trace was printed only in part and the run was gone.

