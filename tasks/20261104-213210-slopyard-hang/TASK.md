# Slopyard's test hung after eight fixtures once, in the confirming round

- STATUS: OPEN
- PRIORITY: 255
- TAGS: bug,slopyard,0.1.6

## State (2026-11-06 01:00, branch `fix/hangs-1105`)

Cause named and fixed; the 20 runs of the test under load are next. The upload's Worker side
read the chosen file through a reader that only its own pending read reached, and Chrome
collects such a Blob stream: the read never ends, so no chunk reaches the kernel and `upload`
waits forever. The transfer now holds its reader (`this.active.reader`, `host/upload/transport.mjs`).

Measured (Chrome 156, headless; scratch harnesses in `build/hangs-evidence/`, not kept):

| run | result |
| --- | --- |
| a Worker reads a posted `File` with a BYOB reader nothing else holds, five `gc()` while the read is pending | 30 of 30 reads never end |
| the same without `gc()` | 30 of 30 read |
| the same with the reader in a global set | 30 of 30 read |
| an in-memory `Blob`; an origin-private file | 20 of 20, 20 of 20 never end |
| a `fetch` body | 20 of 20 read |
| `upload-loop.mjs`: `upload` in `system`, as slopyard's test makes it, with `--expose-gc` and four `gc()` 0-5 ms after the read starts (a probe line in transport.mjs) | the first upload hangs, 2 of 2 runs: the dialog says "Uploading slopyard-controller-arguments.c", "0.0 of 0.0 MiB", as in the hang below |
| the same with the fix | 30 of 30 uploads |

A `gc()` in the same task as the read's start does not hang it: the stream is collectable once
its read waits on the browser. So the hang needs a full collection in the runtime Worker within
the milliseconds the read waits, which is why it came about once in 1,770 uploads and never with
the earlier tracing.

Counts before the cause was known (image inputs `b9e16e76`; `work/evidence-2026-11-05/flaky-evidence/`):

| run | uploads | hangs |
| --- | --- | --- |
| `slopyard-loop.mjs`, headful Chrome with Vulkan on Xvfb :145 in the GPU lock: upload, compile, run per fixture, 300 s a step | 243 | 1 |
| the same with the upload module traced | 1105 | 0 |
| `slopyard-browser.mjs`, 20 runs in a row, traced (18 uploads a run and the game's imports) | 420 | 0 (20 of 20 passed) |
| the loop in headless Chrome (software WebGPU) | 935 | 0 |
| `upload-loop.mjs`, headless: an upload after a short threaded fixture | 2305 | 0 |
| `upload-loop.mjs` in the GPU window, traced | 4005 | 0 |

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

Seen in the confirming round of 2026-11-05 (`integrate/2026-11-05` at 693b9842f, GPU stage,
`work/integrate/build/round-1105b-evidence/gpu-slopyard.log`): the first eight fixtures passed in
seconds each (air-traffic to dock-courier), then nothing until the stage's 2,400 s limit ended the
test. In the same images at 06:24 and 06:26 the test passed twice, 107 s each
(`slopyard-rerun-1.log`, `-2.log`), as it did in the tests branch's tree. Seen again in the
v0.1.5 candidate's last round (15929916a, `round-1105rc-evidence/gpu-slopyard.log`): six fixtures
passed, then nothing until the stage's limit; two reruns passed in 107 s. The same round's other intermittent failure is [rts-arena's SIGPIPE](../20261104-212342-rts-sigpipe/TASK.md):
both appeared once in a round whose new parts are the kernel's signal dispositions, the
spawn request's signal state and applications assembled from packages.

Done when: the ninth fixture's hang is reproduced (a loop of the fixtures under load, as in a
round's GPU stage), its cause named and fixed, and the test passes 20 times in a row.

## Lessons

- A step with no limit turns one lost message into 40 minutes of a round and no evidence. The
  loop's 300 s limit per step, with the process table and the page's state captured at it, is
  what made the one occurrence readable; the test itself waits forever.
- The rate decides the method: 1 in about 1,770 uploads with the test's steps on the GPU path,
  0 in about 3,200 headless and 0 in 4,005 bare uploads in the GPU window. Tracing must be in place before the long loop starts, and saved whole at the
  failure: the first hang's full trace was printed only in part and the run was gone.

