# Firefox: a GPU program left waiting for a readback on a still page, and Ctrl+C on a display program with a GPU child

- STATUS: CLOSED
- PRIORITY: 160
- TAGS: dh,gpu,firefox,browser,core,0.1.8

Found on 2026-11-17 by the deep hedger's test (`demos/deep-hedger/test/deep-hedger-browser.mjs`),
in Firefox 159 (the installed snap, WebGPU enabled, an Xvfb display, RTX 5070). Chrome 156 showed
none of it in any run.

## Reproduce

In the `deep-hedger` image in Firefox, end `dh-gui` and run in the shell, the terminal in front
and nothing else moving on the page:

    dh-fit /tmp/dh/chain.txt 1024 3 60 > /tmp/dh/t.out

About one run in five never returns, nor at `timeout`'s signal. `__dolly.gpu.error` stays empty.
Counted in the morning: 5 of 24 runs on a still page (`work/dh/build/dh-evidence/probe*-ff.log`),
and with Ctrl+C on `dh-gui` and a fit running, `dh-gui` ran on 2 of 16 times and the shell's next
command did not return 2 of 19 times.

## Cause

Not the GPU, nor the still page: `new Worker()` in the runtime Worker, which in Firefox 159 can wait
for good when other Workers it made are ending. Every process launch made one there
(`page/process-supervisor.mjs`), so the runtime Worker stopped: no call returned, no timer fired, no
signal was delivered (`build/ffgpu-evidence/`, 2026-11-17):

- On the 16:50 image, without load, 0 of 108 `dh-fit` runs on a still page hung, and 0 of 28
  Ctrl+C on `dh-gui` with a fit running failed: the morning's rate came with a busier machine.
  The waits Firefox's GPU process settles on its own 100 ms timer (bug 1870699) were all settled:
  1,000 readbacks in a Worker nested in another, on a still page, each in 100 to 104 ms.
- Under CPU load (a load average of 20 to 35), the hangs came back: 6 of 26 runs
  (`still-ff-load-*.log`). Words the runtime Worker set around each blocking step, read by the
  page, showed it in each of the five it was asked: its service tick stopped, inside
  `new Worker()` of `#launchWorker`, the GPU Worker idle with nothing pending. Neither 3 s of
  animation frames nor moving the mouse woke it.
- Without the GPU, the `system` image, a command of 60 process launches on a still page: 5 of 5
  first runs hung under the same load (`spawn-before-load.log`).
- Outside Dolly (`ff/spawn.mjs`): a Worker that makes Workers and ends them stuck inside
  `new Worker()` after 4, 3, 1, 154, 12, 21, 190 and 1,199 of them, however they ended (terminate
  or close), classic or module, from a file or a Blob URL; one that made 200 and ended none did
  not stick. Made by the page instead: 14,038 in 60 s, none stuck. Chrome: 9,566 in a Worker,
  none.

## Fix

The page makes the process Workers and module holders (`host/runtime/runtime.mjs`
`pageWorkers`), only from a `blob:` URL, and each reaches the supervisor on a port it is sent
first. A thread's Worker (`threads@0`) is still made in the runtime Worker: made by the page, a
process of eight threads that exited kept its 512 MiB past the second `process-memory-browser`
gives it, in Chrome, 2 of 2 runs (on `integrate/0.1.8`, a load average of 25; nested, 1 of 1
passed, as the branch did). A call rings a word of the Worker's control buffer, its fields beside it, and so does the
Worker's start: on the port, calls took ten times as long (`dh-fit time`'s read 0.041 s against
0.003 s, a fit of 20 iterations 15.8 s against 8.2 s), and a start announced there came after
the program's first calls. `test/process-browser.mjs`, `ending`, `threads`, `boundary`, `csp`,
`ended-worker`, `dso`, `stack`, `embedding`, `process-memory` and `image` pass in Chrome and
Firefox.

## Closed 2026-11-17

On `fix/firefox-gpu` (`dd68e8d6a`), in Firefox 159, a still page, nothing composited:

- The reproduction returns every time: 0 of 30 `dh-fit` runs hung under the CPU load that hung
  6 of 26 before (`still-ff-fix-load.log`), and 0 of 80 commands of 60 process launches each
  (`spawn-after-load*.log`; Chrome 0 of 20). A call takes as long as before: `dh-fit time` 0.15,
  0.30, 0.04 and 0.003 s.
- Ctrl+C with a fit running ended `dh-gui` and the shell answered after it, 20 of 20 times
  (`ctrlc-ff-fix.log`).
- The test has dropped the frame and leaves `dh-gui` by Ctrl+C with the fit running
  (`758ac2b07`). It passed twice in Chrome 156 and Firefox 159 (`test-2.log`, `test-3.log`: 740
  and 760 iterations in Chrome, 680 in Firefox, the loss to 0.25 or less, 27% of the unhedged
  risk left).

- From the deep hedger's branch, the same night, before the Worker fix was merged there: Firefox
  also stalled four times at a shell pipeline that reads the fit's output of some megabytes (`cat`,
  `grep`, `tail`, `cut`; `build/dh-evidence/batch8-test.log` of 22:12), none in Chrome. A pipeline
  starts processes, so this is likely the same nested-Worker hang. The 0.1.8 round's Firefox run
  of the deep hedger's test confirms it.
