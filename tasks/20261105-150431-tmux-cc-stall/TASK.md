# Firefox: a session's first cc stalled at preparing its 91.6 MiB executable

- STATUS: CLOSED
- PRIORITY: 250
- TAGS: bug,tmux,firefox,0.1.5

## State (2026-11-06 01:55, branch `fix/hangs-1105`)

Closed: cause named, fixed in 35e4b325d (the supervisor holds each holder in a set until it
answers, `compiling` in `src/process-supervisor.mjs`), and the test passed 20 times in a row
under load (below).

The cause: the Worker holding a large executable's module (`compileHeld`,
`src/process-supervisor.mjs`, since d130c6c45) is reachable only through its own handlers until
it answers, and Firefox's cycle collector ends such a Worker once its loop is idle (Firefox's
`WorkerPrivate::Traverse` and `IsEligibleForCC`: a Worker object in a garbage cycle is unlinked
and terminated when its worker has no timers, WorkerRefs, child Workers or pending events; a
pending `WebAssembly.compile` holds a WorkerRef, its end does not). The answer is lost and the
compile's promise never settles: the supervisor wrote the notice and never "ready" or "failed".
Chrome keeps such a Worker.

Measured in Firefox 155 (headless; scratch harnesses in `build/hangs-evidence/exp/`, not kept): a
Worker runs the supervisor's holder code verbatim on the 78 MB `compiler.wasm`, with garbage made
every 5 ms in that Worker (so collections, each followed by a cycle collection, run between its
tasks):

| run | lost answers |
| --- | --- |
| holder held only by its handlers, baseline compiles (0.3 s) | 0 of 40 |
| the same, Ion-only compiles (`wasm_baselinejit` off, 3.7-4.0 s) | 2 of 10, 1 of 25, 4 of 40 |
| the same with the holder in a global set, as the fix holds it | 0 of 10, 0 of 75 |
| a nested Worker that answers at once, held only by its handler | 2 of 100 |
| the same in a global set | 0 of 100 |
| an idle nested Worker, held only by its handler, answering after 3 s | 7 of 20 (rooted: 0 of 20) |
| a page's Worker, held only by its handler, answering at once and closing amid the page's garbage | 0 of 100 |

Each lost holder of the last run had started and begun compiling; it was finalized as its compile
ended, without an answer. The other Workers the runtime Worker makes are held by their owners
(processes, threads, the memory grower); a page's Worker (the image builder makes one) lost none.

Reproduced in Dolly (`cc-loop.mjs`: a fresh tmux-panes page, then `amy install cc && cc`, as the
test types it; probe lines in the supervisor, not kept: a `FinalizationRegistry` on each holder
that writes into the terminal, and garbage made every 5 ms for 10 s from each compile's start):

| run | stalls |
| --- | --- |
| before the fix, 100 rounds | 2: rounds 88 and 90, "preparing 91.6 MiB" and nothing after it, the runtime Worker still answering the page, and "holder created 4291 collected 5019" (3401, 4189): the holder was collected without answering |
| before the fix, another 150 rounds beside it | 0 |
| with the fix, two loops of 125 rounds side by side | 0, and no holder collected |

Without the garbage, about 100 rounds, and with it made in a closure of `compileHeld`'s own scope
(130 rounds), none stalled: that closure's environment reached the holder and held it. In the
round, a collection in the runtime Worker had to end at the instant the answer was in flight;
the 91.6 MiB copy of the executable and the package's records it had just received make one
likely then.

Seen once, on the v0.1.5 candidate's last round (15929916a, 5 Nov 22:13-22:54, demos stage, browser
slots raised from 2 to 3 mid-stage, GPU stage not yet started): tmux's Firefox test waited its
180 s for `BUILT-0-` after `amy install cc ... && cc /tmp/size.c`. The right pane showed
"dolly: preparing 91.6 MiB WebAssembly executable for this session..." and nothing after it: the
supervisor writes "executable ready" or "executable preparation failed" when its compile
settles, so the compile of the 91.6 MiB compiler (`compileHeld`, a Worker of its own since
d130c6c45) never settled. The whole test takes 13-20 s on every earlier round (1104, 1104b, 1105,
1105b) and passed twice on rerun at 22:58 (19.7 s, 19.8 s), with the GPU stage running.

Evidence: `work/integrate/build/round-1105rc-evidence/demos.log` (lines 60-115),
`tmux-firefox-rerun-1.log`, `tmux-firefox-rerun-2.log`.

Done when the stall is reproduced, its cause named and fixed, and the test passes 20 times in a
row under a round's load.

## Closing (2026-11-06)

`node demos/tmux/test/tmux-browser.mjs` (Chrome and Firefox), 20 runs in a row at 01:39-01:54
beside slopyard's GPU test in a loop and the Firefox `cc-loop.mjs` (fresh tmux-panes pages, the
first cc in each): 20 of 20 passed, Firefox's part in 11.6-20.8 s; the load loop's 153 rounds
meanwhile all built. Logs: `build/hangs-evidence/tmux-after*.log` in `work/npmflow`.
