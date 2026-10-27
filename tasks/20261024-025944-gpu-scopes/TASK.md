# gpu@0: each command packet waits a frame for its error scopes

- STATUS: CLOSED
- PRIORITY: 140
- TAGS: core,gpu,performance,0.1.4

## Closed (2026-10-27): the contract keeps the wait

Closed by the integrator's recommendation, which the owner accepted on 2026-10-27 ("the rest of
the items go with your recommendations"). The measurements below answer the question: the error
scopes cost nothing (0.0 to 0.1 ms without presenting), and the wait belongs to presenting the
window, which only a packet that presents pays. `gpu@0` keeps answering each packet with its own
errors; nothing in the contract changes. The Xonotic port packs a frame into as few packets as
fit. The measurement on a real display with GPU compositing needs the owner's machine; it would
reopen the question only if a packet that does not present waited there.

## State (2026-10-24, later): the wait is Xvfb showing the window, not the error scopes

Measured on `core/runtime-cleanup` (Chromium 156, private Xvfb `:147`, NVIDIA; probes and raw
numbers in `work/runtime/build/runtime-evidence/scopes-*.txt` and `fluid-pops*.txt`):

- A plain WebGPU page (push two scopes, a 256-byte copy, submit, pop two): the pops take 0.0 to
  0.1 ms without a canvas, on the page or in a Worker. Presenting a canvas each iteration, the
  pops wait 0.9 ms in an 800x450 window, 20.8 ms at 1280x720 and 41.4 ms at 1920x1080; the
  canvas's own size changes nothing, and an OffscreenCanvas in a Worker waits the same.
  `onSubmittedWorkDone` after a copy: about 0.1 ms.
- Dolly's worker under `gpu-fluid`'s benches (1280x720 window): pops of a batch that presents a
  frame wait 17.9 to 18.2 ms (p90 19), of one that does not 0.1 to 0.2 ms; a batch's own work is
  about 0.2 ms and its GPU time 0.25 to 0.54 ms. `--disable-gpu-vsync --disable-frame-rate-limit`
  makes presenting pops slower (20 to 21 ms), and pacing by `requestAnimationFrame` changes nothing.
- Headless Chrome 156 gave no hardware adapter with any of six flag sets; under SwiftShader
  `fluid` fails ("fluid GPU: I/O error").

So the error scopes cost nothing: a pop answers after the GPU process has handed the window to
the X server, which Xvfb does at a cost proportional to the window's area, and only a batch
that presents pays it. No contract question arises from this. Left: the same on a real
display with GPU compositing, which only the owner's machine can give (agents never use `:1`).
The Xonotic port's three packets per frame each paid the wait, so each may present: a frame
split across packets would then show partial frames, which the port checks first.

## State (2026-10-24, first)

Measured by the Xonotic gpu@0 port (`demo/slopyard-catapults`, Chromium 156 on a private Xvfb
with the NVIDIA adapter), with timers in a test-served copy of `host/gpu/worker.mjs`: each
command packet waits 13 to 18 ms in `await Promise.all([device.popErrorScope(),
device.popErrorScope()])` before the worker replies, while its work takes about 0.4 ms. A
Xonotic frame of 1.7 MB of world arrays takes three packets, so the wait sets its frame rate;
packing a frame into as few packets as fit took the menu from 26 to 41 fps. 13 to 18 ms is
about one 60 Hz frame, which suggests Chrome's GPU process answers at its own tick; then every
`gpu@0` program (0 A.D., llama.cpp's WebGPU backend, `fluid`) pays it per packet.

Not measured yet: the same on a real display (not Xvfb), in Firefox with an adapter, and
which programs it limits. To decide after measuring: whether the reply of a packet may carry
the errors of an earlier one (a change to what `gpu@0` promises the guest, so the owner's),
or whether programs batch more per packet (theirs alone).

Done when: the wait is measured on a real display in Chromium, and either the contract
keeps it with the reason recorded here, or a versioned change removes it with the
replay tests (`gpu-fluid`, `gpu-render`) still equal.
